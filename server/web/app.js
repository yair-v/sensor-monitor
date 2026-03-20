const socket = io();

let state = {};
let currentView = "dashboard";

socket.on("initial_state", (data) => {
    state = data || {};
    render();
});

socket.on("update", (data) => {
    state = data || {};
    render();
});

function setView(view, btn) {
    currentView = view;
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    render();
}

function render() {
    const summary = document.getElementById("summary");
    const content = document.getElementById("content");

    summary.innerHTML = "";
    content.innerHTML = "";

    const data = state.data || {};
    const dhtList = Array.isArray(data.dht) ? data.dht : [];

    renderSummary(summary, dhtList, data);

    if (currentView === "dashboard") {
        renderDashboard(content, dhtList, data);
    } else if (currentView === "dht") {
        renderDHT(content, dhtList);
    } else if (currentView === "motion") {
        renderMotion(content, data);
    } else if (currentView === "compass") {
        renderCompass(content, data);
    } else if (currentView === "env") {
        renderEnv(content, data);
    }
}

function renderSummary(container, dhtList, data) {
    const activeDHT = dhtList.filter((s) => s.enabled);
    const okDHT = dhtList.filter((s) => s.status === "ok" || s.status === "simulated");

    addSummaryCard(container, "Device ID", state.device_id || "-", "תחנת השידור המחוברת");
    addSummaryCard(container, "Last Update", formatDateTime(state.lastUpdate), "זמן עדכון אחרון מהשרת");
    addSummaryCard(container, "DHT Enabled", activeDHT.length, "כמות חיישני DHT פעילים");
    addSummaryCard(container, "DHT Healthy", okDHT.length, "חיישנים עם קריאה תקינה/סימולציה");

    if (data.weather) {
        addSummaryCard(container, "Wind", `${safeVal(data.weather.wind_speed, 0)} km/h`, "רוח מהאינטרנט");
    }

    if (data.location) {
        const lat = safeVal(data.location.lat, "-");
        const lon = safeVal(data.location.lon, "-");
        addSummaryCard(container, "Location", `${lat}, ${lon}`, "מיקום נוכחי");
    }
}

function renderDashboard(container, dhtList, data) {
    if (!state.device_id) {
        addEmpty(container, "ממתין לנתונים מהשרת...");
        return;
    }

    addSectionTitle(container, "סקירה כללית");

    if (dhtList.length > 0) {
        dhtList.forEach((sensor) => addDHTCard(container, sensor));
    } else {
        addEmpty(container, "אין כרגע חיישני DHT להצגה");
    }

    if (data.weather || data.location) {
        const html = `
            <div class="sensor-grid">
                <div class="metric">
                    <div class="metric-label">Wind Speed</div>
                    <div class="metric-value">${data.weather ? `${safeVal(data.weather.wind_speed, 0)} km/h` : "-"}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Location</div>
                    <div class="metric-value">${data.location ? `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}` : "-"}</div>
                </div>
            </div>
        `;
        addCard(container, "Wind & Location", html, true);
    }
}

function renderDHT(container, dhtList) {
    addSectionTitle(container, "חיישני DHT");

    if (!dhtList.length) {
        addEmpty(container, "לא התקבלו חיישני DHT מהסוכן");
        return;
    }

    dhtList.forEach((sensor) => addDHTCard(container, sensor));
}

function renderMotion(container, data) {
    addSectionTitle(container, "Motion / MPU");

    if (!data.mpu) {
        addEmpty(container, "אין כרגע נתוני MPU");
        return;
    }

    addCard(
        container,
        "MPU Data",
        `<pre class="pretty-json">${escapeHtml(JSON.stringify(data.mpu, null, 2))}</pre>`,
        true
    );
}

function renderCompass(container, data) {
    addSectionTitle(container, "Compass / HMC");

    if (!data.hmc) {
        addEmpty(container, "אין כרגע נתוני מצפן");
        return;
    }

    addCard(
        container,
        "Compass Data",
        `<pre class="pretty-json">${escapeHtml(JSON.stringify(data.hmc, null, 2))}</pre>`,
        true
    );
}

function renderEnv(container, data) {
    addSectionTitle(container, "Wind & Location");

    const windHtml = `
        <div class="sensor-grid">
            <div class="metric">
                <div class="metric-label">Wind Speed</div>
                <div class="metric-value">${data.weather ? `${safeVal(data.weather.wind_speed, 0)} km/h` : "-"}</div>
            </div>
            <div class="metric">
                <div class="metric-label">Lat / Lon</div>
                <div class="metric-value">${data.location ? `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}` : "-"}</div>
            </div>
        </div>
    `;

    addCard(container, "Environment", windHtml, true);
}

function addDHTCard(container, sensor) {
    const badge = getStatusBadge(sensor.status);
    const temp = sensor.temp === null || sensor.temp === undefined ? "-" : `${sensor.temp}°C`;
    const humidity = sensor.humidity === null || sensor.humidity === undefined ? "-" : `${sensor.humidity}%`;

    const html = `
        <div class="sensor-card">
            <div class="sensor-header">
                <div class="sensor-name">${escapeHtml(sensor.name || "DHT")}</div>
                <div class="badge ${badge.className}">${badge.label}</div>
            </div>

            <div class="sensor-grid">
                <div class="metric">
                    <div class="metric-label">Temperature</div>
                    <div class="metric-value">${temp}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Humidity</div>
                    <div class="metric-value">${humidity}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">GPIO</div>
                    <div class="metric-value">${safeVal(sensor.gpio, "-")}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Enabled</div>
                    <div class="metric-value">${sensor.enabled ? "Yes" : "No"}</div>
                </div>
            </div>

            <div class="card-subtext">Status: ${escapeHtml(sensor.status || "-")}</div>
        </div>
    `;

    addCard(container, sensor.name || "DHT", html);
}

function addSummaryCard(container, title, value, subtext = "") {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
        <div class="card-title">${escapeHtml(String(title))}</div>
        <div class="card-value">${escapeHtml(String(value))}</div>
        ${subtext ? `<div class="card-subtext">${escapeHtml(String(subtext))}</div>` : ""}
    `;
    container.appendChild(div);
}

function addCard(container, title, html, fullWidth = false) {
    const div = document.createElement("div");
    div.className = `card ${fullWidth ? "full-width" : ""}`;
    div.innerHTML = `
        <div class="card-title">${escapeHtml(String(title))}</div>
        ${html}
    `;
    container.appendChild(div);
}

function addEmpty(container, text) {
    const div = document.createElement("div");
    div.className = "empty-state full-width";
    div.textContent = text;
    container.appendChild(div);
}

function addSectionTitle(container, title) {
    const div = document.createElement("div");
    div.className = "card full-width";
    div.innerHTML = `<div class="card-value" style="font-size:22px;">${escapeHtml(title)}</div>`;
    container.appendChild(div);
}

function getStatusBadge(status) {
    if (status === "ok") {
        return { label: "OK", className: "badge-ok" };
    }

    if (status === "simulated") {
        return { label: "SIMULATED", className: "badge-simulated" };
    }

    if (status === "disabled") {
        return { label: "DISABLED", className: "badge-disabled" };
    }

    if (status === "read_failed") {
        return { label: "READ FAILED", className: "badge-failed" };
    }

    if (String(status || "").startsWith("error")) {
        return { label: "ERROR", className: "badge-error" };
    }

    return { label: String(status || "UNKNOWN").toUpperCase(), className: "badge-failed" };
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

function safeVal(value, fallback) {
    return value === null || value === undefined ? fallback : value;
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}