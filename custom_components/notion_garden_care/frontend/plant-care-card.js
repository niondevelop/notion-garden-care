/**
 * Plant Care Card - Custom Lovelace Card for Notion Garden Care
 *
 * Displays individual plant information with care schedule and action buttons.
 * Texts are translated via ./i18n/<lang>.json (see garden-care-i18n.js).
 */

const {
  t, tv, esc, resolveLanguage, resolveLocale, ensureLanguage,
} = await import(`./garden-care-i18n.js${new URL(import.meta.url).search}`);

const _initialLang = resolveLanguage(null);
await ensureLanguage(_initialLang);

const SENSOR_ICONS = {
  moisture: 'mdi:water-percent',
  temperature: 'mdi:thermometer',
  illuminance: 'mdi:white-balance-sunny',
  conductivity: 'mdi:flower-pollen',
  humidity: 'mdi:water',
  battery: 'mdi:battery',
};

// Attribute key → translation group for Notion select values
const VALUE_GROUPS = {
  type: 'type', lifecycle: 'lifecycle', sun_exposure: 'sun_exposure',
  water_amount: 'water_amount', soil_type: 'soil_type', soil_ph: 'soil_ph',
  toxicity: 'toxicity', prune_months: 'month', harvest_months: 'month',
};

class PlantCareCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._initialized = false;
    this._popupOpen = false;
  }

  set hass(hass) {
    this._hass = hass;
    const lang = resolveLanguage(hass);
    if (lang !== this._lang) {
      this._lang = lang;
      this._locale = resolveLocale(hass);
      this._initialized = false;
      ensureLanguage(lang).then(() => {
        if (this._lang === lang && this._hass) {
          this.render();
          this._initialized = true;
        }
      });
      return;
    }
    if (!this._initialized) {
      this.render();
      this._initialized = true;
    } else {
      this.updateValues();
    }
  }

  _t(key, params) {
    return t(this._lang || _initialLang, key, params);
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error(t(this._lang || _initialLang, 'card.define_entity'));
    }
    this._config = config;
    this._initialized = false;
  }

  getCardSize() {
    return 4;
  }

  static getConfigElement() {
    return document.createElement('plant-care-card-editor');
  }

  static getStubConfig(hass) {
    // Find a garden care entity for the stub config
    const entities = Object.keys(hass.states).filter(e =>
      e.startsWith('sensor.garden_care_') &&
      !e.includes('plants_to_') &&
      !e.includes('active_plants') &&
      !e.includes('database')
    );
    return { entity: entities[0] || '' };
  }

  /**
   * Get icon based on plant type
   */
  getPlantIcon(type) {
    const icons = {
      'Tree': 'mdi:tree',
      'Shrub': 'mdi:tree',
      'Vegetable': 'mdi:carrot',
      'Herb': 'mdi:leaf',
      'Lawn': 'mdi:grass',
      'Plant': 'mdi:flower',
      'Flower': 'mdi:flower',
    };
    return icons[type] || 'mdi:flower';
  }

  /**
   * Calculate days difference from today
   */
  getDaysDiff(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    const diffTime = targetDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Format the due date with status indicator
   */
  formatDueDate(dateStr, label) {
    if (!dateStr) return { text: '-', class: 'neutral' };

    const days = this.getDaysDiff(dateStr);
    const dateFormatted = this.formatLastDate(dateStr);

    if (days < 0) {
      return {
        text: `${dateFormatted} (${this._t('card.overdue', { days: Math.abs(days) })})`,
        class: 'overdue'
      };
    } else if (days === 0) {
      return { text: `${dateFormatted} (${this._t('card.today')})`, class: 'due-today' };
    } else if (days === 1) {
      return { text: `${dateFormatted} (${this._t('card.tomorrow')})`, class: 'due-soon' };
    } else if (days <= 3) {
      return { text: `${dateFormatted} (${this._t('card.in_days', { days })})`, class: 'due-soon' };
    } else {
      return { text: `${dateFormatted} (${this._t('card.in_days', { days })})`, class: 'neutral' };
    }
  }

  /**
   * Format months list with current month highlighted
   */
  formatMonths(monthsArray) {
    if (!monthsArray || !Array.isArray(monthsArray) || monthsArray.length === 0) {
      return { html: '-', hasCurrentMonth: false };
    }

    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    const shortCurrentMonth = new Date().toLocaleString('en-US', { month: 'short' });

    let hasCurrentMonth = false;
    const formatted = monthsArray.map(month => {
      const monthLower = month.toLowerCase();
      const currentLower = currentMonth.toLowerCase();
      const shortLower = shortCurrentMonth.toLowerCase();
      // Month names are stored in English in Notion; display them translated
      const label = esc(tv(this._lang, 'month', month));

      if (monthLower === currentLower || monthLower === shortLower ||
          currentLower.startsWith(monthLower) || monthLower.startsWith(shortLower)) {
        hasCurrentMonth = true;
        return `<span class="current-month">${label}</span>`;
      }
      return label;
    });

    return { html: formatted.join(', '), hasCurrentMonth };
  }

  /**
   * Call a service to mark a task as done with visual feedback
   */
  async callService(service, entityId, buttonId) {
    const button = this.shadowRoot.getElementById(buttonId);
    if (button) {
      const originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `⏳ ${this._t('actions.saving')}`;

      try {
        await this._hass.callService('notion_garden_care', service, {
          entity_id: entityId
        });
        button.innerHTML = `✓ ${this._t('actions.done')}`;
        button.classList.add('success');
        setTimeout(() => {
          button.innerHTML = originalText;
          button.disabled = false;
          button.classList.remove('success');
        }, 2000);
      } catch (err) {
        button.innerHTML = `✗ ${this._t('actions.error')}`;
        button.classList.add('error');
        setTimeout(() => {
          button.innerHTML = originalText;
          button.disabled = false;
          button.classList.remove('error');
        }, 2000);
      }
    }
  }

  /**
   * Format a date for display (short format)
   */
  formatLastDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    try {
      return date.toLocaleDateString(this._locale || 'en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  /**
   * Delete the plant from Notion after confirmation
   */
  async deletePlant(entityId) {
    const yesBtn = this.shadowRoot.getElementById('confirm-yes');
    const noBtn = this.shadowRoot.getElementById('confirm-no');
    if (yesBtn) { yesBtn.disabled = true; yesBtn.textContent = `⏳ ${this._t('actions.deleting')}`; }
    if (noBtn) noBtn.disabled = true;

    try {
      await this._hass.callService('notion_garden_care', 'delete_plant', {
        entity_id: entityId
      });
      if (yesBtn) yesBtn.textContent = `✓ ${this._t('actions.deleted')}`;
    } catch (err) {
      console.error('Failed to delete plant:', err);
      if (yesBtn) { yesBtn.disabled = false; yesBtn.textContent = this._t('actions.delete_yes'); }
      if (noBtn) noBtn.disabled = false;
      const deleteBtn = this.shadowRoot.getElementById('btn-delete');
      if (deleteBtn) deleteBtn.style.display = '';
      this.shadowRoot.getElementById('confirm-delete')?.classList.remove('visible');
    }
  }

  /**
   * Format all attributes as table rows
   */
  formatAttributes(attrs) {
    const skipKeys = ['friendly_name', 'icon', 'sensors', 'water_source'];
    const rows = [];

    for (const [key, value] of Object.entries(attrs)) {
      if (skipKeys.includes(key)) continue;

      const attrKey = `attributes.${key}`;
      const translated = this._t(attrKey);
      const label = translated !== attrKey
        ? translated
        : key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const group = VALUE_GROUPS[key];
      let displayValue = value;

      if (Array.isArray(value)) {
        displayValue = value.map(v => (group ? tv(this._lang, group, v) : v)).join(', ');
      } else if (typeof value === 'boolean') {
        displayValue = value ? this._t('values.yes') : this._t('values.no');
      } else if (value === null || value === undefined) {
        displayValue = '-';
      } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value);
      } else if (group) {
        displayValue = tv(this._lang, group, value);
      }

      rows.push(`<tr><td>${esc(label)}</td><td>${esc(displayValue)}</td></tr>`);
    }

    return rows.join('');
  }

  /**
   * Render linked sensor readings (empty string if no sensors are linked)
   */
  formatSensors(attrs) {
    const sensors = attrs.sensors;
    if (!sensors || typeof sensors !== 'object' || Object.keys(sensors).length === 0) {
      return '';
    }
    const chips = Object.entries(sensors).map(([type, r]) => {
      const status = r?.status || 'unavailable';
      const specificKey = `sensor_status.${type}.${status}`;
      const statusText = this._t(specificKey) !== specificKey
        ? this._t(specificKey)
        : this._t(`sensor_status.${status}`);
      let valueText = '–';
      if (r && r.value !== null && r.value !== undefined) {
        const num = Number(r.value);
        const rounded = Number.isFinite(num)
          ? num.toLocaleString(this._locale || 'en-US', { maximumFractionDigits: 1 })
          : r.value;
        valueText = `${rounded}${r.unit ? ' ' + r.unit : ''}`;
      }
      const title = `${this._t(`sensors.${type}`)}: ${statusText}` +
        (r?.entity_id ? ` (${r.entity_id})` : '');
      return `
        <div class="sensor-chip ${esc(status)}" data-entity="${esc(r?.entity_id || '')}" title="${esc(title)}">
          <ha-icon icon="${SENSOR_ICONS[type] || 'mdi:gauge'}"></ha-icon>
          <span class="sensor-label">${esc(this._t(`sensors.${type}`))}</span>
          <span class="sensor-value">${esc(valueText)}</span>
          ${status !== 'ok' ? `<span class="sensor-status">${esc(statusText)}</span>` : ''}
        </div>`;
    });
    return `<div class="sensor-grid">${chips.join('')}</div>`;
  }

  _bindSensorChips() {
    this.shadowRoot.querySelectorAll('.sensor-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const entityId = chip.dataset.entity;
        if (!entityId) return;
        this.dispatchEvent(new CustomEvent('hass-more-info', {
          bubbles: true, composed: true, detail: { entityId },
        }));
      });
    });
  }

  /**
   * Update only the dynamic values without re-rendering
   */
  updateValues() {
    if (!this._hass || !this._config) return;

    const entityId = this._config.entity;
    const state = this._hass.states[entityId];
    if (!state) return;

    // Update area label (user may have changed area assignment)
    const areaId = this._hass.entities?.[entityId]?.area_id ?? null;
    const areaName = areaId ? (this._hass.areas?.[areaId]?.name ?? null) : null;
    const areaEl = this.shadowRoot.getElementById('plant-area');
    if (areaEl) {
      areaEl.textContent = areaName || '';
      areaEl.style.display = areaName ? '' : 'none';
    }

    const attrs = state.attributes;
    const isLawn = (attrs.type || 'Plant') === 'Lawn';

    // Update care schedule values - next dates
    const nextWater = this.formatDueDate(attrs.next_water, 'Water');
    const nextFertilize = this.formatDueDate(attrs.next_fertilize, 'Fertilize');
    const pruneMonths = this.formatMonths(attrs.prune_months);
    const harvestMonths = this.formatMonths(attrs.harvest_months);

    // Update last dates
    const lastWater = this.formatLastDate(attrs.last_watered);
    const lastFertilize = this.formatLastDate(attrs.last_fertilized);
    const lastPruned = this.formatLastDate(attrs.last_pruned);
    const lastHarvested = this.formatLastDate(attrs.last_harvested);

    const waterEl = this.shadowRoot.getElementById('water-value');
    const fertilizeEl = this.shadowRoot.getElementById('fertilize-value');
    const pruneEl = this.shadowRoot.getElementById('prune-value');
    const harvestEl = this.shadowRoot.getElementById('harvest-value');

    if (waterEl) {
      waterEl.textContent = this._t('card.next', { value: nextWater.text });
      waterEl.className = `care-next care-value ${nextWater.class}`;
    }
    if (fertilizeEl) {
      fertilizeEl.textContent = this._t('card.next', { value: nextFertilize.text });
      fertilizeEl.className = `care-next care-value ${nextFertilize.class}`;
    }
    if (pruneEl) {
      pruneEl.innerHTML = pruneMonths.html;
      pruneEl.className = `care-next care-value ${pruneMonths.hasCurrentMonth ? 'due-today' : ''}`;
    }
    if (harvestEl) {
      harvestEl.innerHTML = harvestMonths.html;
      harvestEl.className = `care-next care-value ${harvestMonths.hasCurrentMonth ? 'due-today' : ''}`;
    }

    // Update last dates
    const waterLastEl = this.shadowRoot.getElementById('water-last');
    const fertilizeLastEl = this.shadowRoot.getElementById('fertilize-last');
    const pruneLastEl = this.shadowRoot.getElementById('prune-last');
    const harvestLastEl = this.shadowRoot.getElementById('harvest-last');

    if (waterLastEl) waterLastEl.textContent = this._t('card.last', { value: lastWater });
    if (fertilizeLastEl) fertilizeLastEl.textContent = this._t('card.last', { value: lastFertilize });
    if (pruneLastEl) pruneLastEl.textContent = this._t('card.last', { value: lastPruned });
    if (harvestLastEl) harvestLastEl.textContent = this._t('card.last', { value: lastHarvested });

    // Update lawn-specific fields if present
    if (isLawn) {
      const nextAeration = this.formatDueDate(attrs.next_aeration, 'Aeration');
      const nextSanding = this.formatDueDate(attrs.next_sanding, 'Sanding');
      const lastAeration = this.formatLastDate(attrs.last_aeration);
      const lastSanding = this.formatLastDate(attrs.last_sanded);
      const lastMowed = this.formatLastDate(attrs.last_mowed);

      const aerationEl = this.shadowRoot.getElementById('aeration-value');
      const sandingEl = this.shadowRoot.getElementById('sanding-value');
      const aerationLastEl = this.shadowRoot.getElementById('aeration-last');
      const sandingLastEl = this.shadowRoot.getElementById('sanding-last');
      const mowedLastEl = this.shadowRoot.getElementById('mowed-last');

      if (aerationEl) {
        aerationEl.textContent = this._t('card.next', { value: nextAeration.text });
        aerationEl.className = `care-next care-value ${nextAeration.class}`;
      }
      if (sandingEl) {
        sandingEl.textContent = this._t('card.next', { value: nextSanding.text });
        sandingEl.className = `care-next care-value ${nextSanding.class}`;
      }
      if (aerationLastEl) aerationLastEl.textContent = this._t('card.last', { value: lastAeration });
      if (sandingLastEl) sandingLastEl.textContent = this._t('card.last', { value: lastSanding });
      if (mowedLastEl) mowedLastEl.textContent = this._t('card.last', { value: lastMowed });
    }

    // Update sensor readings + water source badge
    const sensorSection = this.shadowRoot.getElementById('sensor-section');
    if (sensorSection) {
      sensorSection.innerHTML = this.formatSensors(attrs);
      this._bindSensorChips();
    }
    const waterBadge = this.shadowRoot.getElementById('water-source');
    if (waterBadge) waterBadge.style.display = attrs.water_source === 'sensor' ? '' : 'none';

    // Update popup table content
    const popupTable = this.shadowRoot.querySelector('.popup-table');
    if (popupTable) {
      popupTable.innerHTML = this.formatAttributes(attrs);
    }
  }

  render() {
    if (!this._hass || !this._config) return;

    const entityId = this._config.entity;
    const state = this._hass.states[entityId];

    if (!state) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div class="card-content" style="padding: 16px;">
            <p>${esc(this._t('card.entity_not_found', { entity: entityId }))}</p>
          </div>
        </ha-card>
      `;
      return;
    }

    const attrs = state.attributes;
    const plantName = esc(attrs.plant_name || attrs.name || state.entity_id);
    const plantType = attrs.type || 'Plant';
    const areaId   = this._hass.entities?.[entityId]?.area_id ?? null;
    const areaName = areaId ? (this._hass.areas?.[areaId]?.name ?? null) : null;
    const isLawn = plantType === 'Lawn';

    // Get care schedule data - next dates
    const nextWater = this.formatDueDate(attrs.next_water, 'Water');
    const nextFertilize = this.formatDueDate(attrs.next_fertilize, 'Fertilize');
    const pruneMonths = this.formatMonths(attrs.prune_months);
    const harvestMonths = this.formatMonths(attrs.harvest_months);
    const nextAeration = isLawn ? this.formatDueDate(attrs.next_aeration, 'Aeration') : null;
    const nextSanding = isLawn ? this.formatDueDate(attrs.next_sanding, 'Sanding') : null;

    // Get last dates
    const lastWater = this.formatLastDate(attrs.last_watered);
    const lastFertilize = this.formatLastDate(attrs.last_fertilized);
    const lastPruned = this.formatLastDate(attrs.last_pruned);
    const lastHarvested = this.formatLastDate(attrs.last_harvested);
    const lastAeration = isLawn ? this.formatLastDate(attrs.last_aeration) : null;
    const lastSanding = isLawn ? this.formatLastDate(attrs.last_sanded) : null;
    const lastMowed = isLawn ? this.formatLastDate(attrs.last_mowed) : null;

    // Check if plant has prune/harvest capabilities
    const hasPruneMonths = attrs.prune_months && Array.isArray(attrs.prune_months) && attrs.prune_months.length > 0;
    const hasHarvestMonths = attrs.harvest_months && Array.isArray(attrs.harvest_months) && attrs.harvest_months.length > 0;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          padding: 16px;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .plant-icon {
          --mdc-icon-size: 32px;
          color: var(--primary-color);
        }
        .plant-title {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .plant-name {
          font-size: 1.2em;
          font-weight: 500;
          color: var(--primary-text-color);
          cursor: pointer;
          transition: color 0.15s;
        }
        .plant-name:hover {
          color: var(--primary-color);
          text-decoration: underline;
        }
        .plant-area {
          font-size: 0.75em;
          font-weight: 400;
          color: var(--secondary-text-color);
          line-height: 1.2;
        }
        .care-schedule {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .care-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          border-radius: 8px;
          background: var(--secondary-background-color, #f9f9f9);
        }
        .care-icon {
          font-size: 1.2em;
          width: 28px;
          text-align: center;
        }
        .care-label {
          width: 80px;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .care-value {
          flex: 1;
          color: var(--secondary-text-color);
        }
        .care-value.overdue {
          color: var(--error-color, #db4437);
          font-weight: 500;
        }
        .care-value.due-today {
          color: var(--warning-color, #ff9800);
          font-weight: 500;
        }
        .care-value.due-soon {
          color: var(--warning-color, #ff9800);
        }
        .current-month {
          background: var(--primary-color);
          color: var(--text-primary-color, white);
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
        }
        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          padding-top: 12px;
          border-top: 1px solid var(--divider-color, #e0e0e0);
        }
        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px 12px;
          border: none;
          border-radius: 8px;
          background: var(--primary-color);
          color: var(--text-primary-color, white);
          cursor: pointer;
          font-size: 0.9em;
          transition: opacity 0.2s, background 0.2s;
          min-width: 90px;
        }
        .action-btn:hover:not(:disabled) {
          opacity: 0.85;
        }
        .action-btn:active:not(:disabled) {
          opacity: 0.7;
        }
        .action-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .action-btn.success {
          background: #4CAF50;
        }
        .action-btn.error {
          background: #f44336;
        }
        .action-btn.delete {
          background: transparent;
          color: var(--error-color, #db4437);
          border: 1px solid var(--error-color, #db4437);
          margin-left: auto;
        }
        .action-btn.delete:hover:not(:disabled) {
          background: var(--error-color, #db4437);
          color: white;
          opacity: 1;
        }
        .confirm-delete {
          display: none;
          align-items: center;
          gap: 8px;
          margin-left: auto;
          flex-wrap: wrap;
        }
        .confirm-delete.visible {
          display: flex;
        }
        .confirm-label {
          font-size: 0.85em;
          color: var(--primary-text-color);
          white-space: nowrap;
        }
        .confirm-yes {
          padding: 8px 12px;
          border: none;
          border-radius: 8px;
          background: var(--error-color, #db4437);
          color: white;
          cursor: pointer;
          font-size: 0.85em;
          font-weight: 500;
        }
        .confirm-yes:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .confirm-no {
          padding: 8px 12px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 8px;
          background: transparent;
          color: var(--primary-text-color);
          cursor: pointer;
          font-size: 0.85em;
        }
        .care-dates {
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .care-next {
          color: var(--secondary-text-color);
        }
        .care-last {
          font-size: 0.8em;
          color: var(--disabled-text-color, #999);
        }
        .info-icon {
          cursor: pointer;
          color: var(--secondary-text-color);
          --mdc-icon-size: 24px;
          transition: color 0.2s;
        }
        .info-icon:hover {
          color: var(--primary-color);
        }
        .source-badge {
          display: block;
          width: fit-content;
          white-space: nowrap;
          margin-top: 2px;
          padding: 1px 6px;
          border-radius: 8px;
          font-size: 0.75em;
          font-weight: normal;
          background: var(--secondary-background-color, #f0f0f0);
          color: var(--secondary-text-color);
        }
        .sensor-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 4px 0 12px;
        }
        .sensor-chip {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.85em;
          cursor: pointer;
          background: var(--secondary-background-color, #f0f0f0);
          border: 1px solid transparent;
        }
        .sensor-chip ha-icon { --mdc-icon-size: 16px; color: var(--primary-color); }
        .sensor-chip .sensor-label { color: var(--secondary-text-color); }
        .sensor-chip .sensor-value { font-weight: 500; }
        .sensor-chip .sensor-status { font-size: 0.85em; }
        .sensor-chip.low, .sensor-chip.high {
          border-color: var(--error-color, #db4437);
          color: var(--error-color, #db4437);
        }
        .sensor-chip.low ha-icon, .sensor-chip.high ha-icon { color: var(--error-color, #db4437); }
        .sensor-chip.unavailable { opacity: 0.6; }
        .popup-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
          justify-content: center;
          align-items: center;
        }
        .popup-overlay.open {
          display: flex;
        }
        .popup-content {
          background: var(--card-background-color, white);
          border-radius: 12px;
          padding: 20px;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          position: relative;
        }
        .popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
        }
        .popup-title {
          font-size: 1.2em;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .popup-close {
          cursor: pointer;
          color: var(--secondary-text-color);
          --mdc-icon-size: 24px;
        }
        .popup-close:hover {
          color: var(--primary-color);
        }
        .popup-table {
          width: 100%;
          border-collapse: collapse;
        }
        .popup-table td {
          padding: 6px 8px;
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
          vertical-align: top;
        }
        .popup-table td:first-child {
          font-weight: 500;
          color: var(--primary-text-color);
          white-space: nowrap;
          width: 40%;
        }
        .popup-table td:last-child {
          color: var(--secondary-text-color);
          word-break: break-word;
        }
        .popup-table tr:last-child td {
          border-bottom: none;
        }
      </style>

      <ha-card>
        <div class="header">
          <div class="header-left">
            <ha-icon class="plant-icon" icon="${this.getPlantIcon(plantType)}"></ha-icon>
            <div class="plant-title">
              <span class="plant-name" id="plant-name-link">${plantName}</span>
              <span class="plant-area" id="plant-area" style="${areaName ? '' : 'display:none'}">${esc(areaName || '')}</span>
            </div>
          </div>
          <ha-icon class="info-icon" icon="mdi:information-outline" id="info-toggle" title="${esc(this._t('card.show_attributes'))}"></ha-icon>
        </div>

        <div class="care-schedule">
          <div class="care-row">
            <span class="care-icon">💧</span>
            <span class="care-label">${this._t('card.water')}<span class="source-badge" id="water-source" style="${attrs.water_source === 'sensor' ? '' : 'display:none'}">📡 ${this._t('card.by_sensor')}</span></span>
            <div class="care-dates">
              <span class="care-next care-value ${nextWater.class}" id="water-value">${this._t('card.next', { value: nextWater.text })}</span>
              <span class="care-last" id="water-last">${this._t('card.last', { value: lastWater })}</span>
            </div>
          </div>
          <div class="care-row">
            <span class="care-icon">🧪</span>
            <span class="care-label">${this._t('card.fertilize')}</span>
            <div class="care-dates">
              <span class="care-next care-value ${nextFertilize.class}" id="fertilize-value">${this._t('card.next', { value: nextFertilize.text })}</span>
              <span class="care-last" id="fertilize-last">${this._t('card.last', { value: lastFertilize })}</span>
            </div>
          </div>
          ${hasPruneMonths ? `
          <div class="care-row">
            <span class="care-icon">✂️</span>
            <span class="care-label">${this._t('card.prune')}</span>
            <div class="care-dates">
              <span class="care-next care-value ${pruneMonths.hasCurrentMonth ? 'due-today' : ''}" id="prune-value">${pruneMonths.html}</span>
              <span class="care-last" id="prune-last">${this._t('card.last', { value: lastPruned })}</span>
            </div>
          </div>
          ` : ''}
          ${hasHarvestMonths ? `
          <div class="care-row">
            <span class="care-icon">🍎</span>
            <span class="care-label">${this._t('card.harvest')}</span>
            <div class="care-dates">
              <span class="care-next care-value ${harvestMonths.hasCurrentMonth ? 'due-today' : ''}" id="harvest-value">${harvestMonths.html}</span>
              <span class="care-last" id="harvest-last">${this._t('card.last', { value: lastHarvested })}</span>
            </div>
          </div>
          ` : ''}
          ${isLawn ? `
          <div class="care-row">
            <span class="care-icon">🌱</span>
            <span class="care-label">${this._t('card.aeration')}</span>
            <div class="care-dates">
              <span class="care-next care-value ${nextAeration.class}" id="aeration-value">${this._t('card.next', { value: nextAeration.text })}</span>
              <span class="care-last" id="aeration-last">${this._t('card.last', { value: lastAeration })}</span>
            </div>
          </div>
          <div class="care-row">
            <span class="care-icon">🏖️</span>
            <span class="care-label">${this._t('card.sanding')}</span>
            <div class="care-dates">
              <span class="care-next care-value ${nextSanding.class}" id="sanding-value">${this._t('card.next', { value: nextSanding.text })}</span>
              <span class="care-last" id="sanding-last">${this._t('card.last', { value: lastSanding })}</span>
            </div>
          </div>
          <div class="care-row">
            <span class="care-icon">🚜</span>
            <span class="care-label">${this._t('card.mowed')}</span>
            <div class="care-dates">
              <span class="care-last" id="mowed-last">${this._t('card.last', { value: lastMowed })}</span>
            </div>
          </div>
          ` : ''}
        </div>

        <div id="sensor-section">${this.formatSensors(attrs)}</div>

        <div class="actions">
          <button class="action-btn" id="btn-water">
            💧 ${this._t('actions.watered')}
          </button>
          <button class="action-btn" id="btn-fertilize">
            🧪 ${this._t('actions.fertilized')}
          </button>
          ${hasPruneMonths ? `
          <button class="action-btn" id="btn-prune">
            ✂️ ${this._t('actions.pruned')}
          </button>
          ` : ''}
          ${hasHarvestMonths ? `
          <button class="action-btn" id="btn-harvest">
            🍎 ${this._t('actions.harvested')}
          </button>
          ` : ''}
          ${isLawn ? `
          <button class="action-btn" id="btn-aerate">
            🌱 ${this._t('actions.aerated')}
          </button>
          <button class="action-btn" id="btn-sand">
            🏖️ ${this._t('actions.sanded')}
          </button>
          <button class="action-btn" id="btn-mow">
            🚜 ${this._t('actions.mowed')}
          </button>
          ` : ''}
          <button class="action-btn delete" id="btn-delete" title="${esc(this._t('actions.delete_title'))}">
            🗑️ ${this._t('actions.delete')}
          </button>
          <div class="confirm-delete" id="confirm-delete">
            <span class="confirm-label">${this._t('actions.delete_confirm', { name: plantName })}</span>
            <button class="confirm-yes" id="confirm-yes">${this._t('actions.delete_yes')}</button>
            <button class="confirm-no" id="confirm-no">${this._t('actions.cancel')}</button>
          </div>
        </div>

      </ha-card>

      <div class="popup-overlay" id="popup-overlay">
        <div class="popup-content">
          <div class="popup-header">
            <span class="popup-title">${this._t('card.details', { name: plantName })}</span>
            <ha-icon class="popup-close" icon="mdi:close" id="popup-close"></ha-icon>
          </div>
          <table class="popup-table">
            ${this.formatAttributes(attrs)}
          </table>
        </div>
      </div>
    `;

    // Clicking the plant name opens the HA more-info dialog
    this.shadowRoot.getElementById('plant-name-link')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }));
    });

    // Add event listener for info popup
    const overlay = this.shadowRoot.getElementById('popup-overlay');
    let popupJustOpened = false;

    this.shadowRoot.getElementById('info-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      popupJustOpened = true;
      overlay?.classList.add('open');
      // Reset flag after a short delay to prevent immediate close on mobile
      setTimeout(() => { popupJustOpened = false; }, 300);
    });
    this.shadowRoot.getElementById('popup-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      overlay?.classList.remove('open');
    });
    overlay?.addEventListener('click', (e) => {
      // Only close if clicking on overlay (not content) and popup wasn't just opened
      if (e.target === overlay && !popupJustOpened) {
        overlay.classList.remove('open');
      }
    });

    // Add event listeners for buttons
    const entityIdForService = entityId;
    this.shadowRoot.getElementById('btn-water')?.addEventListener('click', () => {
      this.callService('mark_as_watered', entityIdForService, 'btn-water');
    });
    this.shadowRoot.getElementById('btn-fertilize')?.addEventListener('click', () => {
      this.callService('mark_as_fertilized', entityIdForService, 'btn-fertilize');
    });
    this.shadowRoot.getElementById('btn-prune')?.addEventListener('click', () => {
      this.callService('mark_as_pruned', entityIdForService, 'btn-prune');
    });
    this.shadowRoot.getElementById('btn-harvest')?.addEventListener('click', () => {
      this.callService('mark_as_harvested', entityIdForService, 'btn-harvest');
    });
    this.shadowRoot.getElementById('btn-aerate')?.addEventListener('click', () => {
      this.callService('mark_as_aerated', entityIdForService, 'btn-aerate');
    });
    this.shadowRoot.getElementById('btn-sand')?.addEventListener('click', () => {
      this.callService('mark_as_sanded', entityIdForService, 'btn-sand');
    });
    this.shadowRoot.getElementById('btn-mow')?.addEventListener('click', () => {
      this.callService('mark_as_mowed', entityIdForService, 'btn-mow');
    });

    // Delete button — show inline confirmation
    this.shadowRoot.getElementById('btn-delete')?.addEventListener('click', () => {
      this.shadowRoot.getElementById('btn-delete').style.display = 'none';
      this.shadowRoot.getElementById('confirm-delete').classList.add('visible');
    });
    this.shadowRoot.getElementById('confirm-no')?.addEventListener('click', () => {
      this.shadowRoot.getElementById('btn-delete').style.display = '';
      this.shadowRoot.getElementById('confirm-delete').classList.remove('visible');
    });
    this.shadowRoot.getElementById('confirm-yes')?.addEventListener('click', () => {
      this.deletePlant(entityIdForService);
    });

    this._bindSensorChips();
  }
}

/**
 * Card Editor - Provides UI for configuring the card
 */
class PlantCareCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  setConfig(config) {
    this._config = config;
  }

  configChanged(newConfig) {
    const event = new Event('config-changed', {
      bubbles: true,
      composed: true
    });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }

  render() {
    if (!this._hass) return;

    // Get all garden care plant entities
    const entities = Object.keys(this._hass.states)
      .filter(entityId =>
        entityId.startsWith('sensor.garden_care_') &&
        !entityId.includes('plants_to_') &&
        !entityId.includes('active_plants') &&
        !entityId.includes('database')
      )
      .sort();

    const selectedEntity = this._config?.entity || '';

    this.shadowRoot.innerHTML = `
      <style>
        .editor {
          padding: 16px;
        }
        .row {
          margin-bottom: 16px;
        }
        label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
        }
        select {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, white);
          color: var(--primary-text-color);
          font-size: 14px;
        }
        .hint {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }
      </style>
      <div class="editor">
        <div class="row">
          <label for="entity">${esc(t(resolveLanguage(this._hass), 'editor.plant_entity'))}</label>
          <select id="entity">
            <option value="">${esc(t(resolveLanguage(this._hass), 'editor.select_plant'))}</option>
            ${entities.map(e => {
              const state = this._hass.states[e];
              const name = state?.attributes?.plant_name || state?.attributes?.friendly_name || e;
              return `<option value="${esc(e)}" ${e === selectedEntity ? 'selected' : ''}>${esc(name)}</option>`;
            }).join('')}
          </select>
          <div class="hint">${esc(t(resolveLanguage(this._hass), 'editor.hint'))}</div>
        </div>
      </div>
    `;

    // Add event listener for entity selection
    this.shadowRoot.getElementById('entity').addEventListener('change', (e) => {
      this.configChanged({
        ...this._config,
        entity: e.target.value
      });
    });
  }
}

/**
 * Add Plant Card - Form to add new plants using AI
 */
class AddPlantCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._loading = false;
    this._message = null;
    this._messageType = null;
  }

  set hass(hass) {
    this._hass = hass;
    const lang = resolveLanguage(hass);
    if (lang !== this._lang) {
      this._lang = lang;
      ensureLanguage(lang).then(() => {
        if (this._lang === lang) {
          this.render();
          this._initialized = true;
        }
      });
      return;
    }
    if (!this._initialized) {
      this.render();
      this._initialized = true;
    }
  }

  _t(key, params) {
    return t(this._lang || _initialLang, key, params);
  }

  setConfig(config) {
    this._config = config;
  }

  getCardSize() {
    return 2;
  }

  static getConfigElement() {
    return document.createElement('add-plant-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  /**
   * Check if plant already exists
   */
  plantExists(plantName) {
    if (!this._hass || !plantName) return false;

    const normalizedInput = plantName.toLowerCase().trim();

    // Check all garden care entities
    for (const entityId of Object.keys(this._hass.states)) {
      if (entityId.startsWith('sensor.garden_care_') &&
          !entityId.includes('plants_to_') &&
          !entityId.includes('active_plants') &&
          !entityId.includes('database')) {
        const state = this._hass.states[entityId];
        const existingName = state.attributes.plant_name || state.attributes.name || '';
        if (existingName.toLowerCase().trim() === normalizedInput) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Handle add plant button click
   */
  async addPlant() {
    const input = this.shadowRoot.getElementById('plant-name-input');
    const plantName = input?.value?.trim();

    if (!plantName) {
      this.showMessage(this._t('add_plant.enter_name'), 'error');
      return;
    }

    // Check for duplicates
    if (this.plantExists(plantName)) {
      this.showMessage(this._t('add_plant.exists', { name: plantName }), 'error');
      return;
    }

    // Show loading state
    this._loading = true;
    this.updateUI();

    try {
      await this._hass.callService('notion_garden_care', 'add_plant', {
        plant_name: plantName
      });

      // Trigger a database refresh so the new plant entity appears automatically
      this._hass.callService('notion_garden_care', 'refresh_database', {}).catch(() => {});

      this.showMessage(this._t('add_plant.added', { name: plantName }), 'success');
      input.value = '';

    } catch (err) {
      console.error('Failed to add plant:', err);
      this.showMessage(this._t('add_plant.failed', { error: err.message }), 'error');
    } finally {
      this._loading = false;
      this.updateUI();
    }
  }

  showMessage(text, type) {
    this._message = text;
    this._messageType = type;
    this.updateUI();

    // Clear message after 5 seconds
    setTimeout(() => {
      this._message = null;
      this._messageType = null;
      this.updateUI();
    }, 5000);
  }

  updateUI() {
    const messageEl = this.shadowRoot.getElementById('message');
    const buttonEl = this.shadowRoot.getElementById('add-btn');
    const spinnerEl = this.shadowRoot.getElementById('spinner');

    if (messageEl) {
      messageEl.textContent = this._message || '';
      messageEl.className = `message ${this._messageType || ''}`;
      messageEl.style.display = this._message ? 'block' : 'none';
    }

    if (buttonEl) {
      buttonEl.disabled = this._loading;
      buttonEl.textContent = this._loading ? this._t('add_plant.adding') : this._t('add_plant.button');
    }

    if (spinnerEl) {
      spinnerEl.style.display = this._loading ? 'inline-block' : 'none';
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          padding: 16px;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
        }
        .header-icon {
          --mdc-icon-size: 32px;
          color: var(--primary-color);
        }
        .header-title {
          font-size: 1.2em;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .form-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .input-wrapper {
          flex: 1;
        }
        input[type="text"] {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 8px;
          font-size: 1em;
          background: var(--card-background-color, white);
          color: var(--primary-text-color);
          box-sizing: border-box;
        }
        input[type="text"]:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 0 2px rgba(var(--rgb-primary-color, 33, 150, 243), 0.2);
        }
        input[type="text"]::placeholder {
          color: var(--secondary-text-color);
          opacity: 0.7;
        }
        .add-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          background: var(--primary-color);
          color: var(--text-primary-color, white);
          cursor: pointer;
          font-size: 1em;
          font-weight: 500;
          transition: opacity 0.2s, background 0.2s;
          white-space: nowrap;
        }
        .add-btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .add-btn:active:not(:disabled) {
          opacity: 0.8;
        }
        .add-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .spinner {
          display: none;
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .message {
          display: none;
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 0.9em;
        }
        .message.success {
          background: rgba(76, 175, 80, 0.15);
          color: #2e7d32;
          border: 1px solid rgba(76, 175, 80, 0.3);
        }
        .message.error {
          background: rgba(244, 67, 54, 0.15);
          color: #c62828;
          border: 1px solid rgba(244, 67, 54, 0.3);
        }
        .hint {
          margin-top: 12px;
          font-size: 0.85em;
          color: var(--secondary-text-color);
        }
      </style>

      <ha-card>
        <div class="header">
          <ha-icon class="header-icon" icon="mdi:plus-circle"></ha-icon>
          <span class="header-title">${esc(this._t('add_plant.title'))}</span>
        </div>

        <div class="form-row">
          <div class="input-wrapper">
            <input
              type="text"
              id="plant-name-input"
              placeholder="${esc(this._t('add_plant.placeholder'))}"
            />
          </div>
          <button class="add-btn" id="add-btn">
            <span class="spinner" id="spinner"></span>
            ${esc(this._t('add_plant.button'))}
          </button>
        </div>

        <div class="message" id="message"></div>

        <div class="hint">
          ${esc(this._t('add_plant.hint'))}
        </div>
      </ha-card>
    `;

    // Add event listeners
    this.shadowRoot.getElementById('add-btn')?.addEventListener('click', () => {
      this.addPlant();
    });

    // Allow Enter key to submit
    this.shadowRoot.getElementById('plant-name-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addPlant();
      }
    });
  }
}

/**
 * Add Plant Card Editor
 */
class AddPlantCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = config;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .editor {
          padding: 16px;
        }
        .note {
          color: var(--secondary-text-color);
          font-size: 14px;
        }
      </style>
      <div class="editor">
        <p class="note">${esc(t(_initialLang, 'editor.add_plant_note'))}</p>
      </div>
    `;
  }

  connectedCallback() {
    this.render();
  }
}

// Register the cards and editors (only if not already registered)
if (!customElements.get('plant-care-card')) {
  customElements.define('plant-care-card', PlantCareCard);
}
if (!customElements.get('plant-care-card-editor')) {
  customElements.define('plant-care-card-editor', PlantCareCardEditor);
}
if (!customElements.get('add-plant-card')) {
  customElements.define('add-plant-card', AddPlantCard);
}
if (!customElements.get('add-plant-card-editor')) {
  customElements.define('add-plant-card-editor', AddPlantCardEditor);
}

// Register for card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'plant-care-card',
  name: t(_initialLang, 'picker.plant_card_name'),
  description: t(_initialLang, 'picker.plant_card_desc'),
  preview: true,
  documentationURL: 'https://github.com/pfalzcraft/notion-garden-care'
});
window.customCards.push({
  type: 'add-plant-card',
  name: t(_initialLang, 'picker.add_card_name'),
  description: t(_initialLang, 'picker.add_card_desc'),
  preview: false,
  documentationURL: 'https://github.com/pfalzcraft/notion-garden-care'
});

console.info('%c PLANT-CARE-CARD %c Loaded ',
  'color: white; background: #4CAF50; font-weight: bold;',
  'color: #4CAF50; background: white; font-weight: bold;'
);
console.info('%c ADD-PLANT-CARD %c Loaded ',
  'color: white; background: #2196F3; font-weight: bold;',
  'color: #2196F3; background: white; font-weight: bold;'
);
