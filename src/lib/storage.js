/**
 * Browser storage helpers that never throw. Storage can be unavailable (private
 * windows, blocked site data, quota), so every access is guarded and callers just
 * get null back. Governance data itself always lives in Stardog, never here.
 *
 * `area` is 'local' (survives restarts) or 'session' (survives refresh, cleared with the tab).
 */
const store = (area) => window[`${area}Storage`];

export function loadText(area, key) {
  try { return store(area).getItem(key); } catch { return null; }
}

export function saveText(area, key, value) {
  try { store(area).setItem(key, value); } catch { /* storage unavailable */ }
}

export function removeKey(area, key) {
  try { store(area).removeItem(key); } catch { /* storage unavailable */ }
}

export function loadJson(area, key) {
  const text = loadText(area, key);
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function saveJson(area, key, value) {
  saveText(area, key, JSON.stringify(value));
}
