"""Optional sensor-based plant monitoring.

Plants can be linked to real Home Assistant sensors (soil moisture,
temperature, illuminance, conductivity, air humidity, battery). This module
reads those sensors and compares them with the configured thresholds.

If a plant has no linked sensors, nothing in here changes its behaviour:
the integration keeps using the Notion schedule (Next Water, ...) exactly as
before. If a soil-moisture sensor is linked and currently available, it
replaces the schedule for the "Needs Water" decision, because a real
measurement is more accurate than a fixed interval. When the sensor becomes
unavailable, the schedule is used again as a fallback.
"""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant

from .const import (
    CONF_PLANT_SENSORS,
    MONITORED_SENSOR_TYPES,
    SENSOR_ILLUMINANCE,
    SENSOR_MOISTURE,
    SENSOR_PROBLEM_STATES,
    sensor_entity_key,
    sensor_max_key,
    sensor_min_key,
)

STATUS_OK = "ok"
STATUS_LOW = "low"
STATUS_HIGH = "high"
STATUS_UNAVAILABLE = "unavailable"

WATER_SOURCE_SENSOR = "sensor"
WATER_SOURCE_SCHEDULE = "schedule"


def get_plant_sensor_config(entry: ConfigEntry, page_id: str) -> dict[str, Any]:
    """Return the sensor configuration for a plant ({} if none)."""
    all_cfg = entry.options.get(CONF_PLANT_SENSORS) or {}
    return all_cfg.get(page_id) or {}


def has_any_sensor(config: dict[str, Any]) -> bool:
    """Return True if at least one sensor entity is linked."""
    return any(config.get(sensor_entity_key(t)) for t in MONITORED_SENSOR_TYPES)


def linked_entity_ids(config: dict[str, Any]) -> list[str]:
    """Return all linked sensor entity_ids of a plant configuration."""
    return [
        config[sensor_entity_key(t)]
        for t in MONITORED_SENSOR_TYPES
        if config.get(sensor_entity_key(t))
    ]


def all_linked_entity_ids(entry: ConfigEntry) -> list[str]:
    """Return linked sensor entity_ids of all plants of a config entry."""
    ids: set[str] = set()
    for cfg in (entry.options.get(CONF_PLANT_SENSORS) or {}).values():
        ids.update(linked_entity_ids(cfg or {}))
    return sorted(ids)


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_daytime(hass: HomeAssistant) -> bool:
    """Return True if the sun is up (True if sun.sun is not available)."""
    sun = hass.states.get("sun.sun")
    if sun is None:
        return True
    return sun.state == "above_horizon"


def read_plant_sensors(
    hass: HomeAssistant, config: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Read all linked sensors of a plant and evaluate them.

    Returns a dict keyed by measurement type, e.g.::

        {"moisture": {"entity_id": "sensor.x", "value": 34.0, "unit": "%",
                      "status": "ok", "min": 20, "max": 60}}
    """
    readings: dict[str, dict[str, Any]] = {}

    for sensor_type in MONITORED_SENSOR_TYPES:
        entity_id = config.get(sensor_entity_key(sensor_type))
        if not entity_id:
            continue

        min_value = _to_float(config.get(sensor_min_key(sensor_type)))
        max_value = _to_float(config.get(sensor_max_key(sensor_type)))

        reading: dict[str, Any] = {
            "entity_id": entity_id,
            "value": None,
            "unit": None,
            "status": STATUS_UNAVAILABLE,
            "min": min_value,
            "max": max_value,
        }

        state = hass.states.get(entity_id)
        if state is not None and state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            value = _to_float(state.state)
            reading["unit"] = state.attributes.get("unit_of_measurement")
            if value is not None:
                reading["value"] = value
                status = STATUS_OK
                check_low = min_value is not None
                # Light is naturally 0 at night: only check "too dark" by day.
                if sensor_type == SENSOR_ILLUMINANCE and not _is_daytime(hass):
                    check_low = False
                if check_low and value < min_value:
                    status = STATUS_LOW
                elif max_value is not None and value > max_value:
                    status = STATUS_HIGH
                reading["status"] = status

        readings[sensor_type] = reading

    return readings


def moisture_says_needs_water(
    readings: dict[str, dict[str, Any]]
) -> bool | None:
    """Return the watering decision of the moisture sensor.

    True/False if a moisture sensor is linked and delivers a value,
    None if there is no usable moisture reading (-> fall back to schedule).
    """
    moisture = readings.get(SENSOR_MOISTURE)
    if not moisture or moisture.get("value") is None:
        return None
    if moisture.get("min") is None:
        # Sensor linked but no lower limit configured: nothing to decide.
        return None
    return moisture["status"] == STATUS_LOW


def sensor_problem_states(readings: dict[str, dict[str, Any]]) -> list[str]:
    """Return plant state labels for all out-of-range readings.

    The moisture "low" case is excluded here because it is reported as
    "Needs Water" by the watering logic itself.
    """
    problems: list[str] = []
    for sensor_type in MONITORED_SENSOR_TYPES:
        reading = readings.get(sensor_type)
        if not reading:
            continue
        low_label, high_label = SENSOR_PROBLEM_STATES[sensor_type]
        if reading["status"] == STATUS_LOW and low_label:
            if sensor_type == SENSOR_MOISTURE:
                continue
            problems.append(low_label)
        elif reading["status"] == STATUS_HIGH and high_label:
            problems.append(high_label)
    return problems
