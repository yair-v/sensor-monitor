const socket = io();

let state = {};
let currentView = "dashboard";

socket.on("initial_state", (data) => {
    state = data;
    render();
});

socket.on("update", (data) => {
    state = data;
    render();
});

function setView(view) {
    currentView = view;
    render();
}

function render() {
    const container = document.getElementById("content");
    container.innerHTML = "";

    if (!state.data) return;

    if (currentView === "dashboard") {
        addCard("Device", state.device_id);
        addCard("Last Update", state.lastUpdate);

        if (state.data.weather) {
            addCard("Wind", state.data.weather.wind_speed + " km/h");
        }
    }

    if (currentView === "dht") {
        (state.data.dht || []).forEach((d, i) => {
            addCard(`DHT ${i + 1}`,
                `Temp: ${d.temp}°C<br>Humidity: ${d.humidity}%`
            );
        });
    }

    if (currentView === "motion" && state.data.mpu) {
        addCard("MPU", JSON.stringify(state.data.mpu));
    }

    if (currentView === "compass" && state.data.hmc) {
        addCard("Compass", "Heading: " + state.data.hmc.heading);
    }

    if (currentView === "env") {
        if (state.data.weather) {
            addCard("Wind", state.data.weather.wind_speed + " km/h");
        }
        if (state.data.location) {
            addCard("Location",
                state.data.location.lat + ", " + state.data.location.lon
            );
        }
    }
}

function addCard(title, content) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<h3>${title}</h3><p>${content}</p>`;
    document.getElementById("content").appendChild(div);
}