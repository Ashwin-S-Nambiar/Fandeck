import { paletteMeta } from '../js/share.js';

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
export function shareHtml(template, palette) {
  const meta = paletteMeta(palette);
  const values = {
    description: meta.description,
    'og:title': meta.title,
    'twitter:title': meta.title,
    'og:description': meta.description,
    'twitter:description': meta.description,
    'og:image': meta.image,
    'twitter:image': meta.image,
    'og:image:type': 'image/png',
    'og:image:alt': `Fandeck ${palette.mode.label} palette: ${palette.colors.join(', ')}`,
    'og:url': meta.url,
  };
  return template
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(meta.title)}</title>`,
    )
    .replace(/<meta\b[^>]*>/g, (tag) => {
      const key = tag.match(/\b(?:name|property)="([^"]+)"/)?.[1];
      return Object.hasOwn(values, key)
        ? tag.replace(
            /\bcontent="[^"]*"/,
            `content="${escapeHtml(values[key])}"`,
          )
        : tag;
    })
    .replace(
      /<link\b[^>]*rel="canonical"[^>]*>/,
      `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    );
}
