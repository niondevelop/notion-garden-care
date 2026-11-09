"""Tests for the optional sensor-based monitoring."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.notion_garden_care.const import DOMAIN

ENTRY_DATA = {
    "notion_token": "secret",
    "database_id": "db",
    "create_plant_sensors": True,
}


async def _setup(hass: HomeAssistant, options: dict) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data=ENTRY_DATA, options=options)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_without_sensors_behaviour_unchanged(hass: HomeAssistant, mock_notion) -> None:
    """No linked sensors: schedule decides, no extra entities or attributes."""
    await _setup(hass, {})

    basil = hass.states.get("sensor.garden_care_basil")
    rose = hass.states.get("sensor.garden_care_rose")
    assert basil.state == "Needs Water"
    assert rose.state == "OK"
    assert "sensors" not in basil.attributes
    assert "water_source" not in basil.attributes
    assert hass.states.get("sensor.plants_to_water").state == "1"
    assert hass.states.get("sensor.plants_needing_attention") is None


async def test_moisture_sensor_overrides_schedule(hass: HomeAssistant, mock_notion) -> None:
    """A linked moisture sensor decides about watering and updates live."""
    hass.states.async_set("sensor.basil_moisture", "45", {"unit_of_measurement": "%"})
    hass.states.async_set("sensor.rose_moisture", "12", {"unit_of_measurement": "%"})
    hass.states.async_set("sensor.rose_temp", "40", {"unit_of_measurement": "°C"})

    await _setup(
        hass,
        {
            "plant_sensors": {
                "page-basil": {"moisture_entity": "sensor.basil_moisture", "min_moisture": 20, "max_moisture": 60},
                "page-rose": {
                    "moisture_entity": "sensor.rose_moisture", "min_moisture": 20,
                    "temperature_entity": "sensor.rose_temp", "min_temperature": 5, "max_temperature": 35,
                },
            }
        },
    )

    # Basil is due by schedule, but the soil is moist -> no water needed
    basil = hass.states.get("sensor.garden_care_basil")
    assert basil.state == "OK"
    assert basil.attributes["water_source"] == "sensor"
    assert basil.attributes["sensors"]["moisture"]["value"] == 45.0
    assert basil.attributes["sensors"]["moisture"]["status"] == "ok"

    # Rose is not due by schedule, but the soil is dry and it's too hot
    rose = hass.states.get("sensor.garden_care_rose")
    assert rose.state == "Needs Water, Too Hot"

    to_water = hass.states.get("sensor.plants_to_water")
    assert to_water.state == "1"
    assert to_water.attributes["plant_details"][0]["source"] == "sensor"

    attention = hass.states.get("sensor.plants_needing_attention")
    assert attention.state == "1"
    assert attention.attributes["plant_details"][0]["problems"] == ["Needs Water", "Too Hot"]

    # Live update: Basil dries out
    hass.states.async_set("sensor.basil_moisture", "10", {"unit_of_measurement": "%"})
    await hass.async_block_till_done()
    assert hass.states.get("sensor.garden_care_basil").state == "Needs Water"
    assert hass.states.get("sensor.plants_to_water").state == "2"


async def test_unavailable_sensor_falls_back_to_schedule(hass: HomeAssistant, mock_notion) -> None:
    """If the moisture sensor is unavailable the Notion schedule is used again."""
    hass.states.async_set("sensor.basil_moisture", "unavailable")
    await _setup(
        hass,
        {"plant_sensors": {"page-basil": {"moisture_entity": "sensor.basil_moisture", "min_moisture": 20}}},
    )
    basil = hass.states.get("sensor.garden_care_basil")
    assert basil.state == "Needs Water"
    assert basil.attributes["water_source"] == "schedule"
    assert basil.attributes["sensors"]["moisture"]["status"] == "unavailable"


async def test_too_dark_only_checked_by_day(hass: HomeAssistant, mock_notion) -> None:
    """Low light is not reported at night."""
    hass.states.async_set("sun.sun", "below_horizon")
    hass.states.async_set("sensor.rose_lux", "0", {"unit_of_measurement": "lx"})
    await _setup(
        hass,
        {"plant_sensors": {"page-rose": {"illuminance_entity": "sensor.rose_lux", "min_illuminance": 1000}}},
    )
    assert hass.states.get("sensor.garden_care_rose").state == "OK"

    hass.states.async_set("sun.sun", "above_horizon")
    hass.states.async_set("sensor.rose_lux", "50", {"unit_of_measurement": "lx"})
    await hass.async_block_till_done()
    assert hass.states.get("sensor.garden_care_rose").state == "Too Dark"
