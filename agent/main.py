import json
import time
from pathlib import Path

import requests

from dht_reader import DHTReader


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_payload(config):
    dht_reader = DHTReader(simulation_mode=config.get("simulation_mode", True))
    dht_results = []

    for sensor in config.get("dht_sensors", []):
        result = dht_reader.read_sensor(
            name=sensor.get("name", "DHT"),
            gpio=sensor.get("gpio", 4),
            enabled=sensor.get("enabled", False)
        )
        dht_results.append(result)

    payload = {
        "device_id": config.get("device_id", "raspi-001"),
        "timestamp": int(time.time()),
        "dht": dht_results,
        "mpu": None,
        "hmc": None,
        "weather": {
            "wind_speed": 0
        },
        "location": {
            "lat": None,
            "lon": None
        }
    }

    return payload


def send_payload(server_url, payload):
    response = requests.post(server_url, json=payload, timeout=10)
    response.raise_for_status()


def main():
    print("Sensor agent started")
    while True:
        try:
            config = load_config()
            payload = build_payload(config)
            send_payload(config["server_url"], payload)
            print("sent:", payload["device_id"],
                  "| dht count:", len(payload["dht"]))
        except Exception as exc:
            print("error:", exc)

        try:
            interval = load_config().get("send_interval_seconds", 5)
        except Exception:
            interval = 5

        time.sleep(interval)


if __name__ == "__main__":
    main()
