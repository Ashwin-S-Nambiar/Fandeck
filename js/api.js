const API = 'https://www.thecolorapi.com';
const names = new Map();
const FIXES = { '#000FF6': 'Blue' };

function withTimeout(signal, ms) {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  return AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal;
}

async function get(path, signal) {
  const res = await fetch(`${API}${path}`, {
    signal: withTimeout(signal, 9000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const record = (c) => {
  const hex = c.hex.clean.toUpperCase();
  const name = FIXES[c.name?.closest_named_hex] ?? c.name?.value ?? '';
  if (name) names.set(hex, name);
  return { hex, name };
};

export async function fetchScheme(base, mode, count, signal) {
  const data = await get(
    `/scheme?hex=${base}&mode=${mode}&count=${count}&format=json`,
    signal,
  );
  if (!data.colors?.length) throw new Error('Empty scheme');
  return data.colors.map(record);
}

export function knownName(hex) {
  return names.get(hex) ?? '';
}

export function rememberName(hex, name) {
  if (name) names.set(hex, name);
}

export async function fetchName(hex, signal) {
  if (names.has(hex)) return names.get(hex);
  const data = await get(`/id?hex=${hex}&format=json`, signal);
  return record(data).name;
}
