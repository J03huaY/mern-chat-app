import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
  },
});

// A user can have several sockets at once: two tabs, or a reconnect that
// overlaps the old connection (e.g. after a deploy). Each socket joins a room
// named after its user, and events go to that room, so every open tab gets
// them. A user counts as online while at least one of their sockets is open.
const userSockets = new Map(); // userId -> Set of socket ids

const roomFor = (userId) => `user:${userId}`;

/**
 * Where to send events for `userId`: their room while they have a socket open,
 * else undefined. Use as `io.to(getReceiverSocketId(id)).emit(...)`.
 */
export function getReceiverSocketId(userId) {
    const key = String(userId);
    return userSockets.get(key)?.size ? roomFor(key) : undefined;
}

export const getOnlineUserIds = () => [...userSockets.keys()];

io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId ? String(socket.handshake.query.userId) : null;

    if (userId) {
        socket.join(roomFor(userId));
        if (!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(socket.id);
    }

    // io.emit() sends to every connected client.
    io.emit("getOnlineUsers", getOnlineUserIds());

    socket.on("disconnect", () => {
        // Remove only this socket; the user stays online while another one is open.
        const sockets = userId && userSockets.get(userId);
        if (sockets) {
            sockets.delete(socket.id);
            if (sockets.size === 0) userSockets.delete(userId);
        }
        io.emit("getOnlineUsers", getOnlineUserIds());
    });
});

export { io, app, server };
