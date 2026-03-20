const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static("web"));

/* =========================
   🔥 GLOBAL STATE (BUFFER)
========================= */

let latestState = {
    device_id: null,
    lastUpdate: null,
    data: {}
};

/* =========================
   📡 INGEST (מהרספברי)
========================= */

app.post("/api/ingest", (req, res) => {
    try {
        const payload = req.body;

        latestState = {
            device_id: payload.device_id,
            lastUpdate: new Date().toISOString(),
            data: payload
        };

        io.emit("update", latestState);

        res.json({ status: "ok" });

    } catch (err) {
        console.error("INGEST ERROR:", err);
        res.status(500).json({ error: "failed" });
    }
});

/* =========================
   📥 STATE FETCH (ל־UI)
========================= */

app.get("/api/status", (req, res) => {
    res.json(latestState);
});

/* =========================
   🔌 SOCKET
========================= */

io.on("connection", (socket) => {
    console.log("client connected");

    // 🔥 שולח את המצב האחרון מיד
    socket.emit("initial_state", latestState);

    socket.on("disconnect", () => {
        console.log("client disconnected");
    });
});

/* =========================
   🚀 START
========================= */

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});