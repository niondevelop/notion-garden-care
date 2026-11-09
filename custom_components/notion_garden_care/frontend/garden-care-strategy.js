/**
 * Garden Care — frontend elements
 *
 * GardenAreaCard  (custom:garden-area-card)
 *   Area section header. Uses the HA area picture as background when available.
 *   Bulk-care action buttons: Water All / Fertilize All / Prune All / Harvest All.
 *
 * GardenCareRootCard  (custom:garden-care-root-card)
 *   Self-healing container card placed in garden-care.yaml.
 *   - Auto-discovers all notion_garden_care plant sensors from hass.states.
 *   - Groups them by HA area; renders a responsive grid (one column per area).
 *   - Rebuilds layout only when the set of entities or area assignments change.
 *   - Just propagates hass on normal state updates — zero re-renders for live data.
 *
 * Texts are translated via ./i18n/<lang>.json (see garden-care-i18n.js).
 */

const { t, esc, resolveLanguage, ensureLanguage } =
  await import(`./garden-care-i18n.js${new URL(import.meta.url).search}`);

const _initialLang = resolveLanguage(null);
await ensureLanguage(_initialLang);

// ─────────────────────────────────────────────────────────────────────────────
// GardenAreaCard
// ─────────────────────────────────────────────────────────────────────────────
class GardenAreaCard extends HTMLElement {
  setConfig(config) { this._config = config; }
  getCardSize() { return 1; }

  set hass(hass) {
    this._hass = hass;
    const lang = resolveLanguage(hass);
    if (lang !== this._lang) {
      this._lang = lang;
      ensureLanguage(lang).then(() => {
        if (this._lang === lang) { this._render(); this._rendered = true; }
      });
      return;
    }
    if (!this._rendered) { this._render(); this._rendered = true; }
  }

  _render() {
    const lang = this._lang || _initialLang;
    const areaName  = esc(this._config.area || t(lang, 'area.default_name'));
    const areaId    = this._config.area_id;
    const picture   = this._config.picture || null;   // HA area picture URL

    const actions = [
      { label: `💧 ${t(lang, 'area.water_all')}`,     service: 'mark_as_watered'    },
      { label: `🌿 ${t(lang, 'area.fertilize_all')}`, service: 'mark_as_fertilized' },
      { label: `✂️ ${t(lang, 'area.prune_all')}`,     service: 'mark_as_pruned'     },
      { label: `🍅 ${t(lang, 'area.harvest_all')}`,   service: 'mark_as_harvested'  },
    ];

    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .area-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 18px 16px 16px;
          /* Theme-aware background: uses the HA accent/primary color */
          background: var(--primary-color, #03a9f4);
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
          position: relative;
          min-height: 90px;
        }
        .area-card.has-picture {
          background-size: cover;
          background-position: center;
        }
        .area-card.has-picture::before {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.48);
        }
        /* --text-primary-color is HA's designated text color for primary-color backgrounds */
        .area-name {
          font-size: 1.15em;
          font-weight: 600;
          color: var(--text-primary-color, #fff);
          position: relative;
          z-index: 1;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        }
        .actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          position: relative;
          z-index: 1;
        }
        .action-btn {
          /* Semi-transparent overlay on the theme's primary color */
          background: rgba(255, 255, 255, 0.18);
          color: var(--text-primary-color, #fff);
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 8px;
          padding: 8px 13px;
          font-size: 0.82em;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          white-space: nowrap;
          backdrop-filter: blur(4px);
        }
        .action-btn:hover  { background: rgba(255, 255, 255, 0.32); border-color: rgba(255,255,255,0.6); }
        .action-btn:active { background: rgba(255, 255, 255, 0.10); }
      </style>
      <div class="area-card ${picture ? 'has-picture' : ''}"
           ${picture ? `style="background-image:url('${picture}')"` : ''}>
        <div class="area-name">📍 ${areaName}</div>
        <div class="actions-row">
          ${actions.map(a =>
            `<button class="action-btn" data-service="${a.service}">${a.label}</button>`
          ).join('')}
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this._hass || !areaId) return;
        this._hass.callService('notion_garden_care', btn.dataset.service, { area_id: areaId });
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GardenCareRootCard
// ─────────────────────────────────────────────────────────────────────────────
class GardenCareRootCard extends HTMLElement {
  constructor() {
    super();
    this._hass          = null;
    this._layoutKey     = null;
    this._childCards    = [];
    this._buildId       = 0;
    this._resizeObserver = null;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '<style>:host{display:block}</style>';
  }

  setConfig(config) { this._config = config || {}; }
  getCardSize() { return 1; }

  set hass(hass) {
    this._hass = hass;
    const key = this._getLayoutKey(hass);
    if (key !== this._layoutKey) {
      this._layoutKey = key;
      this._buildLayout();
    } else {
      for (const card of this._childCards) card.hass = hass;
    }
  }

  /** Changes when entity list or their area assignments change. */
  _getLayoutKey(hass) {
    const SKIP = ['plants_to_', 'active_plants', '_database'];
    return resolveLanguage(hass) + '#' + Object.entries(hass.states || {})
      .filter(([id, s]) =>
        id.startsWith('sensor.') &&
        s.attributes?.page_id &&
        !SKIP.some(f => id.includes(f))
      )
      .map(([id]) => `${id}:${hass.entities?.[id]?.area_id ?? ''}`)
      .sort()
      .join('|');
  }

  async _buildLayout() {
    const buildId = ++this._buildId;

    await Promise.all([
      customElements.whenDefined('add-plant-card'),
      customElements.whenDefined('plant-care-card'),
      customElements.whenDefined('garden-area-card'),
    ]);

    if (buildId !== this._buildId) return;   // newer build triggered, bail

    const hass = this._hass;
    const root = this.shadowRoot;

    root.innerHTML = `
      <style>
        :host { display: block; width: 100%; padding: 8px; box-sizing: border-box; }
        .add-plant-wrapper { margin-bottom: 16px; }
        .grid {
          display: grid;
          /* Fallback — ResizeObserver overrides this with an explicit repeat() */
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 12px;
          align-items: start;
          width: 100%;
        }
        .area-column {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .empty-msg {
          padding: 20px;
          text-align: center;
          color: var(--secondary-text-color);
          font-style: italic;
        }
      </style>
      <div class="add-plant-wrapper" id="add-plant"></div>
      <div class="grid" id="grid"></div>
    `;

    // Disconnect any previous observer before re-attaching
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    this._childCards = [];

    // ── Add Plant card (full width above the grid) ─────────────────────────
    const addCard = document.createElement('add-plant-card');
    addCard.setConfig({});
    addCard.hass = hass;
    root.querySelector('#add-plant').appendChild(addCard);
    this._childCards.push(addCard);

    // ── Collect plant entities ─────────────────────────────────────────────
    const SKIP = ['plants_to_', 'active_plants', '_database'];
    const plants = Object.entries(hass.states || {})
      .filter(([id, s]) =>
        id.startsWith('sensor.') &&
        s.attributes?.page_id &&
        !SKIP.some(f => id.includes(f))
      )
      .map(([id]) => {
        const areaId = hass.entities?.[id]?.area_id ?? null;
        return {
          entityId: id,
          areaId,
          areaName:    areaId ? (hass.areas?.[areaId]?.name    ?? areaId) : null,
          areaPicture: areaId ? (hass.areas?.[areaId]?.picture ?? null)   : null,
        };
      })
      .sort((a, b) => a.entityId.localeCompare(b.entityId));

    const grid = root.querySelector('#grid');

    if (plants.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'empty-msg';
      msg.textContent = t(resolveLanguage(hass), 'area.no_plants');
      grid.appendChild(msg);
      return;
    }

    // ── Group by area ──────────────────────────────────────────────────────
    const areas  = {};   // areaName → { areaId, picture, plants[] }
    const noArea = [];

    for (const p of plants) {
      if (p.areaId && p.areaName) {
        if (!areas[p.areaName]) areas[p.areaName] = { areaId: p.areaId, picture: p.areaPicture, plants: [] };
        areas[p.areaName].plants.push(p);
      } else {
        noArea.push(p);
      }
    }

    // ── Helper: create a plant-care-card ───────────────────────────────────
    const _mkPlantCard = (entityId) => {
      const card = document.createElement('plant-care-card');
      card.setConfig({ entity: entityId });
      card.hass = hass;
      this._childCards.push(card);
      return card;
    };

    // ── Render one grid column per area ────────────────────────────────────
    for (const areaName of Object.keys(areas).sort()) {
      const group = areas[areaName];
      const col   = document.createElement('div');
      col.className = 'area-column';

      const areaCard = document.createElement('garden-area-card');
      areaCard.setConfig({ area: areaName, area_id: group.areaId, picture: group.picture });
      areaCard.hass = hass;
      col.appendChild(areaCard);
      this._childCards.push(areaCard);

      for (const p of group.plants) col.appendChild(_mkPlantCard(p.entityId));

      grid.appendChild(col);
    }

    // ── Ungrouped plants in their own column ───────────────────────────────
    if (noArea.length > 0) {
      const col = document.createElement('div');
      col.className = 'area-column';
      for (const p of noArea) col.appendChild(_mkPlantCard(p.entityId));
      grid.appendChild(col);
    }

    // ── Responsive columns via ResizeObserver ──────────────────────────────
    // CSS auto-fill can misreport available width inside shadow DOM / HA card
    // wrappers. Measuring the real pixel width and setting an explicit repeat()
    // is the most reliable cross-browser solution.
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        const cols = Math.max(1, Math.floor(w / 320));
        entry.target.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      }
    });
    this._resizeObserver.observe(grid);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────────────────────
if (!customElements.get('garden-area-card')) {
  customElements.define('garden-area-card', GardenAreaCard);
}
if (!customElements.get('garden-care-root-card')) {
  customElements.define('garden-care-root-card', GardenCareRootCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'garden-care-root-card')) {
  window.customCards.push({
    type: 'garden-care-root-card',
    name: t(_initialLang, 'picker.root_card_name'),
    description: t(_initialLang, 'picker.root_card_desc'),
    preview: false,
    documentationURL: 'https://github.com/pfalzcraft/notion-garden-care',
  });
}

console.info('%c GARDEN-AREA-CARD %c Loaded ',
  'color: white; background: #4CAF50; font-weight: bold;',
  'color: #4CAF50; background: white; font-weight: bold;'
);
console.info('%c GARDEN-CARE-ROOT-CARD %c Loaded ',
  'color: white; background: #2e7d32; font-weight: bold;',
  'color: #2e7d32; background: white; font-weight: bold;'
);
