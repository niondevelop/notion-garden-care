# 🌍 Translations

Notion Garden Care ships with **English** and **German (Deutsch)**.

There are two kinds of translation files:

| What | File(s) | Used by |
|---|---|---|
| Setup wizard, options, actions (services) | `custom_components/notion_garden_care/translations/<lang>.json` | Home Assistant itself (language of the HA user profile) |
| Dashboard cards | `custom_components/notion_garden_care/frontend/i18n/<lang>.json` | `plant-care-card`, `add-plant-card`, `garden-care-root-card`, `garden-area-card` |

`strings.json` is the English source for the HA translations and must stay
identical in structure to `translations/en.json`.

## Adding a language

1. Copy `translations/en.json` → `translations/<code>.json` and translate the values.
2. Copy `frontend/i18n/en.json` → `frontend/i18n/<code>.json` and translate the values.
3. Keep all keys and `{placeholders}` unchanged.
4. Restart Home Assistant and reload the browser (Ctrl+F5).

`<code>` is the HA language code, e.g. `fr`, `nl`, `pt-BR`. The cards try the
full code first (`pt-br`), then the base language (`pt`), then English.
Missing keys fall back to English, so partial translations are fine.

## What is (and is not) translated

- The **Notion database** (column names, select options like `Vegetable`,
  month names) stays English. The integration relies on these names. The
  cards translate them for display only (`values` section in
  `frontend/i18n/<lang>.json`).
- **Entity states** (`Needs Water`, `OK`, …) and entity IDs stay English so
  existing automations, blueprints and templates keep working.
- **AI-added plants**: free-text fields (care instructions, notes, …) are
  written in the HA language; select values stay English.
- Your own texts in Notion (plant names, notes) are never changed.
