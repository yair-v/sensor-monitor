const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 מגיש את ה-frontend
app.use(express.static(path.join(__dirname, "web")));

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "web", "index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3001;

// מצב נוכחי
let currentState = {
    lastUpdate: null,
    device_id: null,
    data: {}
};

// חיבור דפדפן
io.on("connection", (socket) => {
    console.log("Client connected");

    socket.emit("initial_state", currentState);

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

// קבלת נתונים מהרספברי
app.post("/api/ingest", (req, res) => {
    const payload = req.body;

    currentState = {
        lastUpdate: new Date(),
        device_id: payload.device_id,
        data: payload
    };

    io.emit("update", currentState);

    console.log("DATA:", payload.device_id);

    res.json({ status: "ok" });
});

// heartbeat
app.get("/api/status", (req, res) => {
    res.json({ status: "alive" });
});

server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});