const socket = io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 20000
});

let state = {};
let currentView = "dashboard";
let lastStateFetchAt = 0;

let expanded = JSON.parse(localStorage.getItem("sensorExpanded") || "{}");
let customNames = JSON.parse(localStorage.getItem("sensorNames") || "{}");
let sensorOrder = JSON.parse(localStorage.getItem("sensorOrder") || "[]");

const connectionBadge = document.getElementById("connectionBadge");
const hero = document.getElementById("hero");

document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentView = btn.dataset.view;
        render();
    });
});

socket.on("connect", () => {
    setConnectionStatus("online", "מחובר חי");
    fetchState();
});

socket.on("disconnect", () => {
    setConnectionStatus("offline", "החיבור נותק");
});

socket.io.on("reconnect_attempt", () => {
    setConnectionStatus("reconnecting", "מתחבר מחדש...");
});

socket.io.on("reconnect", () => {
    setConnectionStatus("online", "החיבור חזר");
    fetchState();
});

socket.on("initial_state", (data) => {
    if (data) {
        state = data;
        render();
    }
});

socket.on("update", (data) => {
    if (data) {
        state = data;
        render();
    }
});

async function fetchState() {
    const now = Date.now();
    if (now - lastStateFetchAt < 1500) return;
    lastStateFetchAt = now;

    try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();

        if (data && data.data !== undefined) {
            state = data;
            render();
        }
    } catch (_) { }
}

setInterval(fetchState, 5000);

function setConnectionStatus(mode, text) {
    if (!connectionBadge) return;
    connectionBadge.className = `connection-badge ${mode}`;
    connectionBadge.textContent = text;
}

function render() {
    const summary = document.getElementById("summary");
    const content = document.getElementById("content");

    if (!summary || !content) return;

    summary.innerHTML = "";
    content.innerHTML = "";

    const data = state.data || {};
    const dhtList = Array.isArray(data.dht) ? data.dht : [];

    renderHero(data, dhtList);
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

function renderHero(data, dhtList) {
    if (!hero) return;

    const healthy = dhtList.filter((s) => isSensorActive(s)).length;
    const enabled = dhtList.filter((s) => s.enabled).length;

    hero.innerHTML = `
        <div class="hero-title">מערכת ניטור חיישנים</div>
        <div class="hero-subtitle">
            תחנה: <b>${escapeHtml(state.device_id || "-")}</b> ·
            עדכון אחרון: <b>${escapeHtml(formatDateTime(state.lastUpdate))}</b> ·
            חיישני DHT פעילים: <b>${enabled}</b> ·
            חיישנים תקינים: <b>${healthy}</b>
        </div>
    `;
}

function renderSummary(container, dhtList, data) {
    const activeDHT = dhtList.filter((s) => s.enabled);
    const okDHT = dhtList.filter((s) => isSensorActive(s));

    addSummaryCard(container, "Device ID", state.device_id || "-", "תחנת השידור המחוברת");
    addSummaryCard(container, "Last Update", formatDateTime(state.lastUpdate), "זמן עדכון אחרון");
    addSummaryCard(container, "DHT Enabled", activeDHT.length, "חיישני DHT פעילים");
    addSummaryCard(container, "DHT Healthy", okDHT.length, "חיישנים עם קריאה תקינה");

    if (data.weather) {
        addSummaryCard(container, "Wind", `${safeVal(data.weather.wind_speed, 0)} km/h`, "רוח");
    }

    if (data.location) {
        addSummaryCard(
            container,
            "Location",
            `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}`,
            "מיקום"
        );
    }
}

function renderDashboard(container, dhtList, data) {
    if (!state.device_id) {
        addEmpty(container, "ממתין לנתונים מהשרת...");
        return;
    }

    addSectionTitle(container, "סקירה כללית");

    if (dhtList.length) {
        const ordered = sortSensorsBySavedOrder(dhtList);

        const grid = document.createElement("div");
        grid.className = "dashboard-sensor-grid full-width";
        grid.id = "dashboardSensorGrid";

        ordered.forEach((sensor) => {
            grid.appendChild(createDashboardSensorCard(sensor));
        });

        enableDashboardDragAndDrop(grid);
        container.appendChild(grid);
    } else {
        addEmpty(container, "אין כרגע חיישני DHT להצגה");
    }

    const windValue = data.weather ? `${safeVal(data.weather.wind_speed, 0)} km/h` : "-";
    const locationValue = data.location
        ? `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}`
        : "-";

    const envHtml = `
        <div class="sensor-grid">
            <div class="metric">
                <div class="metric-label">Wind Speed</div>
                <div class="metric-value">${escapeHtml(windValue)}</div>
            </div>
            <div class="metric">
                <div class="metric-label">Location</div>
                <div class="metric-value">${escapeHtml(locationValue)}</div>
            </div>
        </div>
    `;

    addCard(container, "Environment", envHtml, true);
}

function renderDHT(container, dhtList) {
    addSectionTitle(container, "חיישני DHT");

    if (!dhtList.length) {
        addEmpty(container, "לא התקבלו חיישני DHT מהסוכן");
        return;
    }

    dhtList.forEach((sensor) => addClassicDHTCard(container, sensor));
}

function renderMotion(container, data) {
    addSectionTitle(container, "תנועה");

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
    addSectionTitle(container, "מצפן");

    if (!data.hmc) {
        addEmpty(container, "אין כרגע נתוני HMC");
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
    addSectionTitle(container, "נתוני סביבה");

    const windValue = data.weather ? `${safeVal(data.weather.wind_speed, 0)} km/h` : "-";
    const locationValue = data.location
        ? `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}`
        : "-";

    const html = `
        <div class="sensor-grid">
            <div class="metric">
                <div class="metric-label">Wind Speed</div>
                <div class="metric-value">${escapeHtml(windValue)}</div>
            </div>
            <div class="metric">
                <div class="metric-label">Latitude / Longitude</div>
                <div class="metric-value">${escapeHtml(locationValue)}</div>
            </div>
        </div>
    `;

    addCard(container, "Environment", html, true);
}

function createDashboardSensorCard(sensor) {
    const sensorKey = getSensorKey(sensor);
    const isExpanded = expanded[sensorKey] ?? false;
    const displayName = customNames[sensorKey] || sensor.name || sensorKey;
    const badge = getStatusBadge(sensor.status);
    const active = isSensorActive(sensor);

    const card = document.createElement("div");
    card.className = `dashboard-sensor-card ${active ? "sensor-active" : "sensor-inactive"}`;
    card.draggable = true;
    card.dataset.sensorKey = sensorKey;

    const temp = sensor.temp === null || sensor.temp === undefined ? "-" : `${sensor.temp}°C`;
    const humidity = sensor.humidity === null || sensor.humidity === undefined ? "-" : `${sensor.humidity}%`;

    card.innerHTML = `
        <div class="dashboard-sensor-topline">
            <label class="sensor-expand-toggle">
                <input type="checkbox" ${isExpanded ? "checked" : ""}>
            </label>

            <input
                class="sensor-name-input"
                type="text"
                value="${escapeHtml(displayName)}"
            >

            <span class="mini-badge ${badge.className}">${badge.label}</span>
        </div>

        <div class="dashboard-sensor-body ${isExpanded ? "" : "collapsed"}">
            <div class="dashboard-mini-grid">
                <div class="mini-metric">
                    <div class="mini-metric-label">Temp</div>
                    <div class="mini-metric-value">${escapeHtml(temp)}</div>
                </div>
                <div class="mini-metric">
                    <div class="mini-metric-label">Humidity</div>
                    <div class="mini-metric-value">${escapeHtml(humidity)}</div>
                </div>
                <div class="mini-metric">
                    <div class="mini-metric-label">GPIO</div>
                    <div class="mini-metric-value">${escapeHtml(String(safeVal(sensor.gpio, "-")))}</div>
                </div>
                <div class="mini-metric">
                    <div class="mini-metric-label">Enabled</div>
                    <div class="mini-metric-value">${sensor.enabled ? "Yes" : "No"}</div>
                </div>
            </div>
            <div class="dashboard-sensor-statusline">Status: ${escapeHtml(sensor.status || "-")}</div>
        </div>
    `;

    const toggle = card.querySelector('input[type="checkbox"]');
    toggle.addEventListener("change", () => {
        expanded[sensorKey] = toggle.checked;
        localStorage.setItem("sensorExpanded", JSON.stringify(expanded));
        render();
    });

    const nameInput = card.querySelector(".sensor-name-input");
    nameInput.addEventListener("change", () => {
        customNames[sensorKey] = nameInput.value.trim() || sensor.name || sensorKey;
        localStorage.setItem("sensorNames", JSON.stringify(customNames));
        render();
    });

    return card;
}

function addClassicDHTCard(container, sensor) {
    const badge = getStatusBadge(sensor.status);
    const temp = sensor.temp === null || sensor.temp === undefined ? "-" : `${sensor.temp}°C`;
    const humidity = sensor.humidity === null || sensor.humidity === undefined ? "-" : `${sensor.humidity}%`;

    const html = `
        <div class="sensor-card">
            <div class="sensor-header">
                <div class="sensor-name">${escapeHtml(customNames[getSensorKey(sensor)] || sensor.name || "DHT")}</div>
                <div class="badge ${badge.className}">${badge.label}</div>
            </div>

            <div class="sensor-grid">
                <div class="metric">
                    <div class="metric-label">Temperature</div>
                    <div class="metric-value">${escapeHtml(temp)}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Humidity</div>
                    <div class="metric-value">${escapeHtml(humidity)}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">GPIO</div>
                    <div class="metric-value">${escapeHtml(String(safeVal(sensor.gpio, "-")))}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Enabled</div>
                    <div class="metric-value">${sensor.enabled ? "Yes" : "No"}</div>
                </div>
            </div>

            <div class="card-subtext">Status: ${escapeHtml(sensor.status || "-")}</div>
        </div>
    `;

    addCard(container, customNames[getSensorKey(sensor)] || sensor.name || "DHT", html);
}

function enableDashboardDragAndDrop(grid) {
    let dragged = null;

    grid.querySelectorAll(".dashboard-sensor-card").forEach((card) => {
        card.addEventListener("dragstart", () => {
            dragged = card;
            card.classList.add("dragging");
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            dragged = null;
            saveDashboardOrder(grid);
        });

        card.addEventListener("dragover", (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(grid, e.clientY);
            if (!dragged) return;

            if (afterElement == null) {
                grid.appendChild(dragged);
            } else if (afterElement !== dragged) {
                grid.insertBefore(dragged, afterElement);
            }
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll(".dashboard-sensor-card:not(.dragging)")];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveDashboardOrder(grid) {
    const items = [...grid.querySelectorAll(".dashboard-sensor-card")];
    sensorOrder = items.map((item) => item.dataset.sensorKey);
    localStorage.setItem("sensorOrder", JSON.stringify(sensorOrder));
}

function sortSensorsBySavedOrder(sensors) {
    const ordered = [...sensors].sort((a, b) => {
        const aKey = getSensorKey(a);
        const bKey = getSensorKey(b);
        const ai = sensorOrder.indexOf(aKey);
        const bi = sensorOrder.indexOf(bKey);

        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });

    const missingKeys = ordered.map(getSensorKey).filter((key) => !sensorOrder.includes(key));
    if (missingKeys.length) {
        sensorOrder = [...sensorOrder, ...missingKeys];
        localStorage.setItem("sensorOrder", JSON.stringify(sensorOrder));
    }

    return ordered;
}

function getSensorKey(sensor) {
    return `${sensor.name || "sensor"}__${sensor.gpio ?? "na"}`;
}

function isSensorActive(sensor) {
    return sensor.enabled && (
        sensor.status === "ok" ||
        sensor.status === "simulated" ||
        sensor.status === "unstable"
    );
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
    div.innerHTML = `<div class="section-title">${escapeHtml(title)}</div>`;
    container.appendChild(div);
}

function getStatusBadge(status) {
    if (status === "ok") return { label: "OK", className: "badge-ok" };
    if (status === "simulated") return { label: "SIMULATED", className: "badge-simulated" };
    if (status === "unstable") return { label: "UNSTABLE", className: "badge-simulated" };
    if (status === "disabled") return { label: "DISABLED", className: "badge-disabled" };
    if (status === "read_failed" || String(status || "").startsWith("read_failed")) {
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