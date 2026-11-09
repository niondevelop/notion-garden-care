"""Translation files must stay complete and in sync."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.translation import async_get_translations

COMPONENT = Path(__file__).parent.parent / "custom_components" / "notion_garden_care"


def _keys(data: dict, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, value in data.items():
        keys.add(prefix + key)
        if isinstance(value, dict):
            keys |= _keys(value, f"{prefix}{key}.")
    return keys


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_strings_matches_english() -> None:
    assert _load(COMPONENT / "strings.json") == _load(COMPONENT / "translations" / "en.json")


@pytest.mark.parametrize("path", sorted((COMPONENT / "translations").glob("*.json")), ids=lambda p: p.name)
def test_backend_translation_complete(path: Path) -> None:
    assert _keys(_load(path)) == _keys(_load(COMPONENT / "strings.json"))


@pytest.mark.parametrize("path", sorted((COMPONENT / "frontend" / "i18n").glob("*.json")), ids=lambda p: p.name)
def test_frontend_translation_complete(path: Path) -> None:
    assert _keys(_load(path)) == _keys(_load(COMPONENT / "frontend" / "i18n" / "en.json"))


async def test_german_translations_load(hass: HomeAssistant) -> None:
    translations = await async_get_translations(
        hass, "de", "options", {"notion_garden_care"}
    )
    assert (
        translations["component.notion_garden_care.options.step.init.menu_options.plant_sensors"]
        == "Pflanzensensoren (optional)"
    )
