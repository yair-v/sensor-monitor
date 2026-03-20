const socket = io();

let state = {};
let expanded = JSON.parse(localStorage.getItem("expanded") || "{}");
let customNames = JSON.parse(localStorage.getItem("names") || "{}");
let order = JSON.parse(localStorage.getItem("order") || "[]");

socket.on("initial_state", (data) => {
    state = data || {};
    render();
});

socket.on("update", (data) => {
    state = data || {};
    render();
});

function render() {
    const content = document.getElementById("content");
    content.innerHTML = "";

    const dhtList = state?.data?.dht || [];

    // שמירה על סדר
    const sorted = [...dhtList].sort((a, b) => {
        const ai = order.indexOf(a.name);
        const bi = order.indexOf(b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    sorted.forEach((sensor) => {
        content.appendChild(createCard(sensor));
    });
}

function createCard(sensor) {
    const isExpanded = expanded[sensor.name] ?? true;
    const displayName = customNames[sensor.name] || sensor.name;
    const isActive = sensor.status === "ok" || sensor.status === "simulated";

    const div = document.createElement("div");
    div.className = "sensor-card";
    div.draggable = true;

    div.style.background = isActive
        ? "rgba(34,197,94,0.1)"
        : "rgba(239,68,68,0.1)";

    div.style.border = isActive
        ? "1px solid rgba(34,197,94,0.4)"
        : "1px solid rgba(239,68,68,0.4)";

    div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" ${isExpanded ? "checked" : ""} onchange="toggleExpand('${sensor.name}')">

            <input 
                value="${displayName}" 
                onchange="renameSensor('${sensor.name}', this.value)"
                style="background:transparent;border:none;color:white;font-weight:bold;width:100%;">
        </div>

        ${isExpanded
            ? `
        <div style="margin-top:10px;font-size:14px;">
            🌡️ ${sensor.temp ?? "-"}°C<br>
            💧 ${sensor.humidity ?? "-"}%<br>
            📍 GPIO ${sensor.gpio}<br>
            ⚙️ ${sensor.status}
        </div>
        `
            : ""
        }
    `;

    // Drag events
    div.addEventListener("dragstart", () => {
        div.classList.add("dragging");
    });

    div.addEventListener("dragend", () => {
        div.classList.remove("dragging");
        saveOrder();
    });

    return div;
}

function toggleExpand(name) {
    expanded[name] = !expanded[name];
    localStorage.setItem("expanded", JSON.stringify(expanded));
    render();
}

function renameSensor(name, newName) {
    customNames[name] = newName;
    localStorage.setItem("names", JSON.stringify(customNames));
}

function saveOrder() {
    const cards = [...document.querySelectorAll(".sensor-card")];
    order = cards.map((c, i) => {
        const name = state.data.dht[i].name;
        return name;
    });
    localStorage.setItem("order", JSON.stringify(order));
}

// Drag reorder
document.addEventListener("dragover", (e) => {
    e.preventDefault();
    const container = document.getElementById("content");
    const dragging = document.querySelector(".dragging");
    const after = getDragAfterElement(container, e.clientY);

    if (after == null) {
        container.appendChild(dragging);
    } else {
        container.insertBefore(dragging, after);
    }
});

function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll(".sensor-card:not(.dragging)")];

    return els.reduce(
        (closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        },
        { offset: Number.NEGATIVE_INFINITY }
    ).element;
}