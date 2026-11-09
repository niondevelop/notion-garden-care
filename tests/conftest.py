"""Shared fixtures for Notion Garden Care tests."""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable loading of custom_components in all tests."""
    yield


@pytest.fixture(autouse=True)
async def setup_core(hass: HomeAssistant) -> None:
    """The conversation dependency needs the core integration."""
    assert await async_setup_component(hass, "homeassistant", {})


def _page(page_id: str, name: str, next_water: str | None) -> dict:
    return {
        "id": page_id,
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": name}]},
            "Type": {"type": "select", "select": {"name": "Herb"}},
            "Active": {"type": "checkbox", "checkbox": True},
            "Next Water": {
                "type": "formula",
                "formula": {"type": "date", "date": {"start": next_water} if next_water else None},
            },
        },
    }


@pytest.fixture
def notion_data() -> dict:
    """Two plants: Basil is due for water by schedule, Rose is not."""
    today = date.today()
    return {
        "results": [
            _page("page-basil", "Basil", (today - timedelta(days=1)).isoformat()),
            _page("page-rose", "Rose", (today + timedelta(days=5)).isoformat()),
        ],
        "has_more": False,
    }


@pytest.fixture
def mock_notion(notion_data):
    """Patch every call that would reach Notion or touch the frontend."""
    client = MagicMock()
    client.databases.retrieve.return_value = {}
    with (
        patch("custom_components.notion_garden_care.Client", return_value=client),
        patch(
            "custom_components.notion_garden_care._async_ensure_database_up_to_date",
            return_value=None,
        ),
        patch(
            "custom_components.notion_garden_care._async_register_frontend",
            return_value=None,
        ),
        patch(
            "custom_components.notion_garden_care.sensor._fetch_database_data",
            return_value=notion_data,
        ),
    ):
        yield client
