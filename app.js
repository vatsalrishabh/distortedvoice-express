const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // For development only; restrict in production!
    methods: ["GET", "POST"]
  }
});

const users = new Map(); // username -> socket.id
const calls = new Map(); // username -> targetUsername

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("register", (username) => {
    if ([...users.keys()].includes(username)) {
      socket.emit("username-error", "Username already taken");
    } else {
      users.set(username, socket.id);
      socket.username = username;
      io.emit("users", [...users.keys()]);
    }
  });

  socket.on("offer", ({ to, offer }) => {
    if (calls.has(socket.username) || calls.has(to)) {
      socket.emit("call-error", "One of the users is already in a call.");
      return;
    }
    const targetId = users.get(to);
    if (targetId) {
      calls.set(socket.username, to);
      calls.set(to, socket.username);
      io.to(targetId).emit("offer", { from: socket.username, offer });
    }
  });

  socket.on("answer", ({ to, answer }) => {
    const targetId = users.get(to);
    if (targetId) io.to(targetId).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const targetId = users.get(to);
    if (targetId) io.to(targetId).emit("ice-candidate", { candidate });
  });

  socket.on("end-call", ({ to }) => {
    calls.delete(socket.username);
    calls.delete(to);
    const targetId = users.get(to);
    if (targetId) {
      io.to(targetId).emit("call-ended");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    if (socket.username) {
      users.delete(socket.username);
      // End any active call
      const peer = calls.get(socket.username);
      if (peer) {
        calls.delete(peer);
        const peerId = users.get(peer);
        if (peerId) {
          io.to(peerId).emit("call-ended");
        }
      }
      calls.delete(socket.username);
    }
    io.emit("users", [...users.keys()]);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});