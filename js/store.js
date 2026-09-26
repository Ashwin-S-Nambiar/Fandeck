export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const HISTORY_KEY = 'csg:history';
const HISTORY_MAX = 24;

export function readHistory() {
  const list = load(HISTORY_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function pushHistory(entry) {
  const key = entry.swatches.map((s) => s.hex).join('');
  const list = readHistory().filter(
    (e) => e.swatches.map((s) => s.hex).join('') !== key,
  );
  list.unshift({ ...entry, at: Date.now() });
  save(HISTORY_KEY, list.slice(0, HISTORY_MAX));
}

export function clearHistory() {
  save(HISTORY_KEY, []);
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
