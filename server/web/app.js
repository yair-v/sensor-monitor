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
let customDeviceName = localStorage.getItem("customDeviceName") || "";

let draftDeviceName = customDeviceName || "";
let isEditingDeviceName = false;

const connectionBadge = document.getElementById("connectionBadge");
const hero = document.getElementById("hero");
const summary = document.getElementById("summary");
const content = document.getElementById("content");

bindNav();

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
    if (!data) return;
    state = data;
    normalizeSensorOrder();
    renderAll();
});

socket.on("update", (data) => {
    if (!data) return;
    state = data;
    normalizeSensorOrder();
    renderLiveUpdate();
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
            normalizeSensorOrder();
            renderLiveUpdate();
        }
    } catch (_) { }
}

setInterval(fetchState, 5000);

function bindNav() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.onclick = () => {
            document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            currentView = btn.dataset.view;
            renderAll();
        };
    });
}

function setConnectionStatus(mode, text) {
    if (!connectionBadge) return;
    connectionBadge.className = `connection-badge ${mode}`;
    connectionBadge.textContent = text;
}

function getData() {
    return state.data || {};
}

function getDhtList() {
    const dht = getData().dht;
    return Array.isArray(dht) ? dht : [];
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

function getDisplayDeviceName() {
    return customDeviceName || state.device_id || "-";
}

function getDisplaySensorName(sensor) {
    return customNames[getSensorKey(sensor)] || sensor.name || "DHT";
}

function normalizeSensorOrder() {
    const currentKeys = getDhtList().map(getSensorKey);
    const valid = sensorOrder.filter((k) => currentKeys.includes(k));
    const missing = currentKeys.filter((k) => !valid.includes(k));
    sensorOrder = [...valid, ...missing];
    localStorage.setItem("sensorOrder", JSON.stringify(sensorOrder));
}

function sortSensorsBySavedOrder(sensors) {
    return [...sensors].sort((a, b) => {
        const ai = sensorOrder.indexOf(getSensorKey(a));
        const bi = sensorOrder.indexOf(getSensorKey(b));
        return ai - bi;
    });
}

function renderLiveUpdate() {
    renderHero();
    renderSummary();

    if (currentView === "dashboard") {
        renderDashboard(true);
    } else if (currentView === "dht") {
        renderDHT();
    } else if (currentView === "motion") {
        renderMotion();
    } else if (currentView === "compass") {
        renderCompass();
    } else if (currentView === "env") {
        renderEnv();
    }
}

function renderAll() {
    renderHero();
    renderSummary();

    if (currentView === "dashboard") {
        renderDashboard(false);
    } else if (currentView === "dht") {
        renderDHT();
    } else if (currentView === "motion") {
        renderMotion();
    } else if (currentView === "compass") {
        renderCompass();
    } else if (currentView === "env") {
        renderEnv();
    }
}

function renderHero() {
    if (!hero) return;

    const dhtList = getDhtList();
    const healthy = dhtList.filter((s) => isSensorActive(s)).length;
    const enabled = dhtList.filter((s) => s.enabled).length;

    hero.innerHTML = `
        <div class="hero-title">מערכת ניטור חיישנים</div>
        <div class="hero-subtitle">
            תחנה: <b>${escapeHtml(getDisplayDeviceName())}</b> ·
            עדכון אחרון: <b>${escapeHtml(formatDateTime(state.lastUpdate))}</b> ·
            חיישני DHT פעילים: <b>${enabled}</b> ·
            חיישנים תקינים: <b>${healthy}</b>
        </div>
    `;
}

function renderSummary() {
    if (!summary) return;

    summary.innerHTML = "";

    const data = getData();
    const dhtList = getDhtList();

    addSummaryCard(summary, "Device Name", getDisplayDeviceName(), "שם המכשיר להצגה");
    addSummaryCard(summary, "Device ID", state.device_id || "-", "מזהה התחנה");
    addSummaryCard(summary, "Last Update", formatDateTime(state.lastUpdate), "זמן עדכון אחרון");
    addSummaryCard(summary, "DHT Enabled", dhtList.filter((s) => s.enabled).length, "חיישנים פעילים");
    addSummaryCard(summary, "DHT Healthy", dhtList.filter((s) => isSensorActive(s)).length, "חיישנים תקינים");

    if (data.weather) {
        addSummaryCard(summary, "Wind", `${safeVal(data.weather.wind_speed, 0)} km/h`, "רוח");
    }

    if (data.location) {
        addSummaryCard(
            summary,
            "Location",
            `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}`,
            "מיקום"
        );
    }
}

function renderDashboard(liveOnly) {
    if (!content) return;

    if (!liveOnly) {
        content.innerHTML = "";

        addSectionTitle(content, "סקירה כללית");

        const editor = document.createElement("div");
        editor.className = "card full-width";
        editor.innerHTML = `
            <div class="card-title">שם המכשיר</div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <input
                    id="deviceNameInput"
                    type="text"
                    value="${escapeHtml(draftDeviceName || getDisplayDeviceName())}"
                    style="flex:1; min-width:220px; background:rgba(11,18,32,0.8); border:1px solid #334155; color:white; border-radius:10px; padding:10px 12px;"
                />
                <button id="saveDeviceNameBtn" style="background:#2563eb; color:white; border:none; border-radius:10px; padding:10px 14px; cursor:pointer;">שמור</button>
                <button id="resetDeviceNameBtn" style="background:#334155; color:white; border:none; border-radius:10px; padding:10px 14px; cursor:pointer;">אפס</button>
            </div>
        `;
        content.appendChild(editor);

        const grid = document.createElement("div");
        grid.className = "dashboard-sensor-grid full-width";
        grid.id = "dashboardSensorGrid";
        content.appendChild(grid);

        const env = document.createElement("div");
        env.className = "card full-width";
        env.id = "dashboardEnvCard";
        content.appendChild(env);

        bindDeviceNameEditor();
    }

    renderDashboardSensors();
    renderDashboardEnvironment();
}

function bindDeviceNameEditor() {
    const input = document.getElementById("deviceNameInput");
    const saveBtn = document.getElementById("saveDeviceNameBtn");
    const resetBtn = document.getElementById("resetDeviceNameBtn");

    if (!input) return;

    input.onfocus = () => {
        isEditingDeviceName = true;
    };

    input.onblur = () => {
        isEditingDeviceName = false;
        draftDeviceName = input.value;
    };

    input.oninput = () => {
        draftDeviceName = input.value;
    };

    if (saveBtn) {
        saveBtn.onclick = () => {
            customDeviceName = (draftDeviceName || "").trim();
            localStorage.setItem("customDeviceName", customDeviceName);
            renderHero();
            renderSummary();
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            customDeviceName = "";
            draftDeviceName = "";
            localStorage.removeItem("customDeviceName");
            input.value = state.device_id || "";
            renderHero();
            renderSummary();
        };
    }
}

function renderDashboardSensors() {
    const grid = document.getElementById("dashboardSensorGrid");
    if (!grid) return;

    const sensors = sortSensorsBySavedOrder(getDhtList());

    if (!sensors.length) {
        grid.innerHTML = `<div class="empty-state full-width">אין כרגע חיישני DHT להצגה</div>`;
        return;
    }

    const existing = new Map(
        [...grid.querySelectorAll(".dashboard-sensor-card")].map((el) => [el.dataset.sensorKey, el])
    );

    const orderedEls = [];

    sensors.forEach((sensor) => {
        const key = getSensorKey(sensor);
        let card = existing.get(key);

        if (!card) {
            card = createDashboardSensorCard(sensor);
        }

        updateDashboardSensorCard(card, sensor);
        orderedEls.push(card);
    });

    grid.innerHTML = "";
    orderedEls.forEach((el) => grid.appendChild(el));
    enableDashboardDragAndDrop(grid);
}

function createDashboardSensorCard(sensor) {
    const key = getSensorKey(sensor);

    const card = document.createElement("div");
    card.className = "dashboard-sensor-card";
    card.draggable = true;
    card.dataset.sensorKey = key;

    card.innerHTML = `
        <div class="dashboard-sensor-topline">
            <label class="sensor-expand-toggle">
                <input class="sensor-expand-checkbox" type="checkbox">
            </label>

            <input class="sensor-name-input" type="text">

            <span class="mini-badge sensor-badge">-</span>
        </div>

        <div class="dashboard-sensor-body">
            <div class="dashboard-mini-grid">
                <div class="mini-metric">
                    <div class="mini-metric-label">Temp</div>
                    <div class="mini-metric-value sensor-temp">-</div>
                </div>
                <div class="mini-metric">
                    <div class="mini-metric-label">Humidity</div>
                    <div class="mini-metric-value sensor-humidity">-</div>
                </div>
                <div class="mini-metric">
                    <div class="mini-metric-label">GPIO</div>
                    <div class="mini-metric-value sensor-gpio">-</div>
                </div>
                <div class="mini-metric">
                    <div class="mini-metric-label">Enabled</div>
                    <div class="mini-metric-value sensor-enabled">-</div>
                </div>
            </div>
            <div class="dashboard-sensor-statusline sensor-statusline">-</div>
        </div>
    `;

    const toggle = card.querySelector(".sensor-expand-checkbox");
    toggle.onchange = () => {
        expanded[key] = toggle.checked;
        localStorage.setItem("sensorExpanded", JSON.stringify(expanded));
        const body = card.querySelector(".dashboard-sensor-body");
        body.classList.toggle("collapsed", !toggle.checked);
    };

    const nameInput = card.querySelector(".sensor-name-input");
    nameInput.oninput = () => {
        customNames[key] = nameInput.value;
        localStorage.setItem("sensorNames", JSON.stringify(customNames));
    };

    nameInput.onchange = () => {
        customNames[key] = nameInput.value.trim() || sensor.name || key;
        localStorage.setItem("sensorNames", JSON.stringify(customNames));
        renderHero();
        renderSummary();
    };

    return card;
}

function updateDashboardSensorCard(card, sensor) {
    const key = getSensorKey(sensor);
    const isExpanded = expanded[key] ?? false;
    const displayName = getDisplaySensorName(sensor);
    const badge = getStatusBadge(sensor.status);
    const active = isSensorActive(sensor);

    const temp = sensor.temp == null ? "-" : `${sensor.temp}°C`;
    const humidity = sensor.humidity == null ? "-" : `${sensor.humidity}%`;

    card.className = `dashboard-sensor-card ${active ? "sensor-active" : "sensor-inactive"}`;
    card.dataset.sensorKey = key;

    const toggle = card.querySelector(".sensor-expand-checkbox");
    const input = card.querySelector(".sensor-name-input");
    const badgeEl = card.querySelector(".sensor-badge");
    const body = card.querySelector(".dashboard-sensor-body");

    toggle.checked = isExpanded;
    body.classList.toggle("collapsed", !isExpanded);

    if (document.activeElement !== input) {
        input.value = displayName;
    }

    badgeEl.textContent = badge.label;
    badgeEl.className = `mini-badge sensor-badge ${badge.className}`;

    card.querySelector(".sensor-temp").textContent = temp;
    card.querySelector(".sensor-humidity").textContent = humidity;
    card.querySelector(".sensor-gpio").textContent = String(safeVal(sensor.gpio, "-"));
    card.querySelector(".sensor-enabled").textContent = sensor.enabled ? "Yes" : "No";
    card.querySelector(".sensor-statusline").textContent = `Status: ${sensor.status || "-"}`;
}

function renderDashboardEnvironment() {
    const env = document.getElementById("dashboardEnvCard");
    if (!env) return;

    const data = getData();
    const windValue = data.weather ? `${safeVal(data.weather.wind_speed, 0)} km/h` : "-";
    const locationValue = data.location
        ? `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}`
        : "-";

    env.innerHTML = `
        <div class="card-title">Environment</div>
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
}

function renderDHT() {
    content.innerHTML = "";
    const sensors = getDhtList();

    addSectionTitle(content, "חיישני DHT");

    if (!sensors.length) {
        addEmpty(content, "לא התקבלו חיישני DHT מהסוכן");
        return;
    }

    sensors.forEach((sensor) => addClassicDHTCard(content, sensor));
}

function renderMotion() {
    content.innerHTML = "";
    const data = getData();

    addSectionTitle(content, "תנועה");

    if (!data.mpu) {
        addEmpty(content, "אין כרגע נתוני MPU");
        return;
    }

    addCard(content, "MPU Data", `<pre class="pretty-json">${escapeHtml(JSON.stringify(data.mpu, null, 2))}</pre>`, true);
}

function renderCompass() {
    content.innerHTML = "";
    const data = getData();

    addSectionTitle(content, "מצפן");

    if (!data.hmc) {
        addEmpty(content, "אין כרגע נתוני HMC");
        return;
    }

    addCard(content, "Compass Data", `<pre class="pretty-json">${escapeHtml(JSON.stringify(data.hmc, null, 2))}</pre>`, true);
}

function renderEnv() {
    content.innerHTML = "";
    const data = getData();

    addSectionTitle(content, "נתוני סביבה");

    const windValue = data.weather ? `${safeVal(data.weather.wind_speed, 0)} km/h` : "-";
    const locationValue = data.location
        ? `${safeVal(data.location.lat, "-")}, ${safeVal(data.location.lon, "-")}`
        : "-";

    addCard(
        content,
        "Environment",
        `
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
        `,
        true
    );
}

function addClassicDHTCard(container, sensor) {
    const badge = getStatusBadge(sensor.status);
    const temp = sensor.temp == null ? "-" : `${sensor.temp}°C`;
    const humidity = sensor.humidity == null ? "-" : `${sensor.humidity}%`;

    addCard(
        container,
        getDisplaySensorName(sensor),
        `
        <div class="sensor-card">
            <div class="sensor-header">
                <div class="sensor-name">${escapeHtml(getDisplaySensorName(sensor))}</div>
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
        `
    );
}

function enableDashboardDragAndDrop(grid) {
    let dragged = null;

    grid.querySelectorAll(".dashboard-sensor-card").forEach((card) => {
        card.ondragstart = () => {
            dragged = card;
            card.classList.add("dragging");
        };

        card.ondragend = () => {
            card.classList.remove("dragging");
            dragged = null;
            saveDashboardOrder(grid);
        };

        card.ondragover = (e) => {
            e.preventDefault();
            const after = getDragAfterElement(grid, e.clientY);
            if (!dragged) return;

            if (after == null) {
                grid.appendChild(dragged);
            } else if (after !== dragged) {
                grid.insertBefore(dragged, after);
            }
        };
    });
}

function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll(".dashboard-sensor-card:not(.dragging)")];

    return els.reduce((closest, child) => {
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
    return value == null ? fallback : value;
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}