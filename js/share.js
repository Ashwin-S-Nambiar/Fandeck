import { cleanHex, MODES } from './color.js';

export const SHARE_ORIGIN = 'https://fandeck.ashwin.co.in';
export function sharedPalette(params) {
  if (params.getAll('c').length + params.getAll('palette').length !== 1)
    return null;
  const raw = params.get('c') ?? params.get('palette');
  if (!raw || raw.length > 40) return null;
  const colors = raw.split('-').map(cleanHex);
  if (colors.length !== 5 || colors.some((color) => !color)) return null;
  const mode =
    MODES.find((item) => item.id === params.get('m')) ??
    MODES.find((item) => item.id === 'analogic');
  const base = cleanHex(params.get('b')) ?? colors[2];
  return { colors, mode, base };
}

export function paletteImage({ colors, mode }) {
  return `${SHARE_ORIGIN}/api/og?${new URLSearchParams({ c: colors.join('-'), m: mode.id, v: '1' })}`;
}

export function paletteMeta(palette) {
  const params = new URLSearchParams({
    c: palette.colors.join('-'),
    m: palette.mode.id,
    b: palette.base,
  });
  return {
    title: `${palette.mode.label} palette · Fandeck`,
    description: `Five colors to take anywhere: ${palette.colors.map((hex) => `#${hex}`).join(', ')}. Check contrast and export on Fandeck.`,
    image: paletteImage(palette),
    url: `${SHARE_ORIGIN}/?${params}`,
  };
}
