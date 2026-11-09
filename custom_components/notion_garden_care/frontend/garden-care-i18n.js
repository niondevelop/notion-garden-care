/**
 * Garden Care — frontend translations
 *
 * Translation files live next to this module in ./i18n/<language>.json
 * (e.g. i18n/en.json, i18n/de.json). To add a language, copy en.json to
 * <code>.json and translate the values — no code change needed.
 *
 * The language follows the Home Assistant user profile (hass.locale.language),
 * falls back to the base language ("de-CH" → "de") and finally to English.
 */

const FALLBACK = 'en';
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';
const _dicts = {};      // lang → dictionary (null = not available)
const _pending = {};    // lang → Promise

/** Language code to use for the given hass object. */
export function resolveLanguage(hass) {
  const raw = hass?.locale?.language || hass?.language
    || document.querySelector('home-assistant')?.hass?.language
    || navigator.language || FALLBACK;
  return String(raw).toLowerCase();
}

/** BCP-47 locale for date formatting (keeps region, e.g. "de-DE"). */
export function resolveLocale(hass) {
  return hass?.locale?.language || hass?.language || navigator.language || 'en-US';
}

function _load(lang) {
  if (lang in _dicts) return Promise.resolve(_dicts[lang]);
  if (_pending[lang]) return _pending[lang];
  const url = new URL(`./i18n/${lang}.json`, import.meta.url);
  if (VERSION) url.searchParams.set('v', VERSION);
  _pending[lang] = fetch(url, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(dict => { _dicts[lang] = dict; delete _pending[lang]; return dict; });
  return _pending[lang];
}

/** Load the dictionaries needed for a language (incl. fallbacks). */
export async function ensureLanguage(lang) {
  const base = lang.split('-')[0];
  await Promise.all([_load(FALLBACK), _load(lang), base !== lang ? _load(base) : null]);
}

function _lookup(dict, key) {
  if (!dict) return undefined;
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), dict);
}

/**
 * Translate a key like "card.water". Placeholders: {name} → params.name.
 * Returns the key itself if no translation exists.
 */
export function t(lang, key, params = {}) {
  const base = (lang || FALLBACK).split('-')[0];
  let str = _lookup(_dicts[lang], key);
  if (typeof str !== 'string') str = _lookup(_dicts[base], key);
  if (typeof str !== 'string') str = _lookup(_dicts[FALLBACK], key);
  if (typeof str !== 'string') return key;
  return str.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m));
}

/** True if a translation exists for the key (in lang or fallbacks). */
export function has(lang, key) {
  return t(lang, key) !== key;
}

/**
 * Translate a data value coming from Notion (e.g. plant type "Vegetable",
 * month "March"). Unknown values are returned unchanged.
 */
export function tv(lang, group, value) {
  if (value === null || value === undefined || value === '') return value;
  const key = `values.${group}.${value}`;
  return has(lang, key) ? t(lang, key) : value;
}

/** Simple HTML escaping for user/Notion provided text. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
