import random
from typing import Dict, Any

try:
    import Adafruit_DHT
except ImportError:
    Adafruit_DHT = None


class DHTReader:
    def __init__(self, simulation_mode: bool = True):
        self.simulation_mode = simulation_mode
        self.sensor_type = Adafruit_DHT.DHT11 if Adafruit_DHT else None

    def read_sensor(self, name: str, gpio: int, enabled: bool) -> Dict[str, Any]:
        if not enabled:
            return {
                "name": name,
                "gpio": gpio,
                "enabled": False,
                "status": "disabled",
                "temp": None,
                "humidity": None
            }

        if self.simulation_mode or Adafruit_DHT is None:
            return self._fake_read(name, gpio)

        try:
            humidity, temperature = Adafruit_DHT.read_retry(
                self.sensor_type, gpio)
            if humidity is None or temperature is None:
                return {
                    "name": name,
                    "gpio": gpio,
                    "enabled": True,
                    "status": "read_failed",
                    "temp": None,
                    "humidity": None
                }

            return {
                "name": name,
                "gpio": gpio,
                "enabled": True,
                "status": "ok",
                "temp": round(float(temperature), 1),
                "humidity": round(float(humidity), 1)
            }
        except Exception as exc:
            return {
                "name": name,
                "gpio": gpio,
                "enabled": True,
                "status": f"error: {exc}",
                "temp": None,
                "humidity": None
            }

    def _fake_read(self, name: str, gpio: int) -> Dict[str, Any]:
        return {
            "name": name,
            "gpio": gpio,
            "enabled": True,
            "status": "simulated",
            "temp": round(20 + random.random() * 10, 1),
            "humidity": round(40 + random.random() * 30, 1)
        }
