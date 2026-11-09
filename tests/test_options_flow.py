"""Tests for the options flow (AI agent + plant sensors)."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.notion_garden_care.const import DOMAIN


async def _setup(hass: HomeAssistant, options: dict | None = None) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={"notion_token": "secret", "database_id": "db"},
        options=options or {"conversation_agent": "conversation.test"},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_link_and_remove_plant_sensors(hass: HomeAssistant, mock_notion) -> None:
    """Link a moisture sensor to a plant, then remove it again."""
    hass.states.async_set("sensor.basil_moisture", "10", {"unit_of_measurement": "%"})
    entry = await _setup(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    assert result["menu_options"] == ["ai_agent", "plant_sensors"]

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "plant_sensors"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "plant_sensors"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"plant": "page-basil"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "plant_sensor_config"
    assert result["description_placeholders"] == {"plant": "Basil"}

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"moisture_entity": "sensor.basil_moisture", "min_moisture": 25, "max_moisture": 70,
         "min_temperature": 5},  # threshold without entity is dropped
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()

    # Existing options are kept, sensor config is stored
    assert entry.options["conversation_agent"] == "conversation.test"
    assert entry.options["plant_sensors"] == {
        "page-basil": {"moisture_entity": "sensor.basil_moisture", "min_moisture": 25.0, "max_moisture": 70.0}
    }
    # Entry was reloaded -> plant sensor uses the moisture reading
    basil = hass.states.get("sensor.garden_care_basil")
    assert basil.attributes["water_source"] == "sensor"
    assert hass.states.get("sensor.plants_needing_attention") is not None

    # Remove again
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "plant_sensors"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"plant": "page-basil"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"moisture_entity": "sensor.basil_moisture", "remove_sensors": True}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.options["plant_sensors"] == {}
    assert "sensors" not in hass.states.get("sensor.garden_care_basil").attributes
    assert hass.states.get("sensor.plants_needing_attention") is None


async def test_ai_agent_option_keeps_sensor_config(hass: HomeAssistant, mock_notion) -> None:
    """Changing the AI agent must not wipe the plant sensor configuration."""
    sensors = {"page-rose": {"moisture_entity": "sensor.x", "min_moisture": 20.0}}
    entry = await _setup(hass, {"conversation_agent": "", "plant_sensors": sensors})

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "ai_agent"}
    )
    assert result["step_id"] == "ai_agent"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"conversation_agent": ""}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["plant_sensors"] == sensors
