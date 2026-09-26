import { formatColor, inkFor, tokenNames } from './color.js';

export function toCss(swatches, format) {
  const names = tokenNames(swatches);
  const lines = swatches.map(
    (s, i) => `  --${names[i]}: ${formatColor(s.hex, format)};`,
  );
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function toTailwind(swatches, format) {
  const names = tokenNames(swatches);
  const lines = swatches.map(
    (s, i) => `  --color-${names[i]}: ${formatColor(s.hex, format)};`,
  );
  return `@theme {\n${lines.join('\n')}\n}\n`;
}

export function toJson(swatches, meta) {
  const colors = swatches.map((s) => ({
    name: s.name || null,
    hex: formatColor(s.hex, 'hex'),
    rgb: formatColor(s.hex, 'rgb'),
    hsl: formatColor(s.hex, 'hsl'),
    oklch: formatColor(s.hex, 'oklch'),
  }));
  return `${JSON.stringify({ ...meta, colors }, null, 2)}\n`;
}

export async function toPng(swatches, { width = 1600, height = 900 } = {}) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const col = width / swatches.length;
  swatches.forEach((s, i) => {
    const x = Math.round(i * col);
    const w = Math.round((i + 1) * col) - x;
    g.fillStyle = `#${s.hex}`;
    g.fillRect(x, 0, w, height);
    const ink = `#${inkFor(s.hex)}`;
    g.fillStyle = ink;
    g.globalAlpha = 0.72;
    g.font = '500 26px "Hanken Grotesk", "Hanken Grotesk Fallback", sans-serif';
    g.fillText(s.name || '', x + 36, height - 96, w - 64);
    g.globalAlpha = 1;
    g.font = '400 40px "Fragment Mono", "Fragment Mono Fallback", monospace';
    g.fillText(`#${s.hex}`, x + 36, height - 44, w - 64);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
