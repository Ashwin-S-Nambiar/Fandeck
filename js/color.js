export const MODES = [
  { id: 'monochrome', label: 'Mono' },
  { id: 'monochrome-dark', label: 'Mono dark' },
  { id: 'monochrome-light', label: 'Mono light' },
  { id: 'analogic', label: 'Analogic' },
  { id: 'complement', label: 'Complement' },
  { id: 'analogic-complement', label: 'Analogic + comp' },
  { id: 'triad', label: 'Triad' },
  { id: 'quad', label: 'Quad' },
];

export const FORMATS = ['hex', 'rgb', 'hsl', 'oklch'];

export function cleanHex(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  return null;
}

export function hexToRgb(hex) {
  const h = cleanHex(hex);
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  return [r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }) {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function rgbToOklch({ r, g, b }) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: C < 0.0001 ? 0 : H };
}

const trim = (n, digits) => String(Number(n.toFixed(digits)));

export function formatColor(hex, format) {
  const h = cleanHex(hex);
  const rgb = hexToRgb(h);
  if (format === 'rgb') return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
  if (format === 'hsl') {
    const { h: hue, s, l } = rgbToHsl(rgb);
    return `hsl(${Math.round(hue)} ${Math.round(s)}% ${Math.round(l)}%)`;
  }
  if (format === 'oklch') {
    const { l, c, h: hue } = rgbToOklch(rgb);
    return `oklch(${trim(l, 3)} ${trim(c, 3)} ${trim(hue, 1)})`;
  }
  return `#${h}`;
}

export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function grade(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'Large';
  return 'Fail';
}

export function inkFor(hex) {
  return contrast(hex, 'FFFFFF') >= contrast(hex, '000000')
    ? 'FFFFFF'
    : '000000';
}

export function randomBase() {
  const h = Math.random() * 360;
  const s = 55 + Math.random() * 35;
  const l = 42 + Math.random() * 22;
  return rgbToHex(hslToRgb({ h, s, l }));
}

const wrap = (h) => ((h % 360) + 360) % 360;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function localScheme(base, mode, count = 5) {
  const { h, s, l } = rgbToHsl(hexToRgb(base));
  const steps = Array.from({ length: count }, (_, i) => i - (count - 1) / 2);
  const make = (hue, sat, light) =>
    rgbToHex(
      hslToRgb({ h: wrap(hue), s: clamp(sat, 0, 100), l: clamp(light, 6, 96) }),
    );
  const plans = {
    monochrome: (i) => make(h, s, l + steps[i] * 14),
    'monochrome-dark': (i) => make(h, s, l - i * 10),
    'monochrome-light': (i) => make(h, s, l + i * 9),
    analogic: (i) => make(h + steps[i] * 22, s, l),
    complement: (i) =>
      make(i < count / 2 ? h : h + 180, s, l + (i % 2 ? 10 : -6)),
    'analogic-complement': (i) =>
      make(i === count - 1 ? h + 180 : h + steps[i] * 25, s, l),
    triad: (i) => make(h + (i % 3) * 120, s, l + (i > 2 ? 12 : 0)),
    quad: (i) => make(h + (i % 4) * 90, s, l + (i > 3 ? 12 : 0)),
  };
  const plan = plans[mode] ?? plans.analogic;
  return Array.from({ length: count }, (_, i) => plan(i));
}

export function slug(name, fallback) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || fallback;
}

export function tokenNames(swatches) {
  const seen = new Map();
  return swatches.map((sw, i) => {
    const base = slug(sw.name, `color-${i + 1}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}-${n}` : base;
  });
}

const fromLinear = (v) =>
  (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

export function oklchToRgb({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: fromLinear(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1),
    g: fromLinear(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1),
    b: fromLinear(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1),
  };
}

export function inGamut({ r, g, b }) {
  return (
    r >= -0.5 &&
    r <= 255.5 &&
    g >= -0.5 &&
    g <= 255.5 &&
    b >= -0.5 &&
    b <= 255.5
  );
}

export function maxChroma(l, h) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function hexToOklch(hex) {
  return rgbToOklch(hexToRgb(hex));
}

export function oklchToHex(lch) {
  const c = Math.min(lch.c, maxChroma(lch.l, lch.h));
  return rgbToHex(oklchToRgb({ ...lch, c }));
}
