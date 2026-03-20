import time
import requests
import random

SERVER_URL = "https://YOUR-RENDER-URL.onrender.com/api/ingest"
DEVICE_ID = "raspi-001"

def generate_data():
    return {
        "device_id": DEVICE_ID,
        "dht": [
            {"temp": round(20 + random.random()*5, 1), "humidity": random.randint(40,70)},
            {"temp": round(21 + random.random()*5, 1), "humidity": random.randint(40,70)}
        ],
        "mpu": {
            "x": round(random.random(),2),
            "y": round(random.random(),2),
            "z": round(random.random(),2)
        },
        "hmc": {
            "heading": random.randint(0,360)
        },
        "weather": {
            "wind_speed": random.randint(0,20)
        },
        "location": {
            "lat": 32.1,
            "lon": 34.8
        }
    }

while True:
    try:
        data = generate_data()
        requests.post(SERVER_URL, json=data, timeout=5)
        print("sent")
    except Exception as e:
        print("error:", e)

    time.sleep(3)