import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GET } from '../api/og.js';
import { paletteImage, sharedPalette } from '../js/share.js';
import { shareHtml } from '../server/html.js';

const query = 'c=264653-2A9D8F-E9C46A-F4A261-E76F51&m=analogic';
test('only five valid colors are accepted; aliases and short hex normalize to one image URL', () => {
  for (const raw of [
    'c=fff-000',
    'c=fff-000-123-456-<script>',
    'c=fff-000-123-456-789&c=fff-000-123-456-789',
    'c=fff-000-123-456-789&palette=fff-000-123-456-789',
  ])
    assert.equal(sharedPalette(new URLSearchParams(raw)), null);
  const a = sharedPalette(
    new URLSearchParams('c=fff-000-123-456-789&m=triad&b=fff'),
  );
  const b = sharedPalette(
    new URLSearchParams(
      'palette=FFFFFF-000000-112233-445566-778899&m=triad&b=000&noise=10',
    ),
  );
  assert.equal(paletteImage(a), paletteImage(b));
  assert.match(paletteImage(a), /&v=1$/);
});

test('shared HTML contains the palette image without removing the app', async () => {
  const palette = sharedPalette(new URLSearchParams(query));
  const html = shareHtml(
    await readFile(new URL('../index.html', import.meta.url), 'utf8'),
    palette,
  );
  assert.match(html, /<title>Analogic palette · Fandeck<\/title>/);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(html, /#264653, #2A9D8F, #E9C46A, #F4A261, #E76F51/);
  for (const key of ['property="og:image"', 'name="twitter:image"'])
    assert.ok(
      html.includes(
        `${key} content="${paletteImage(palette).replaceAll('&', '&amp;')}"`,
      ),
    );
  assert.match(html, /src="\/js\/main.js"/);
});

test('image endpoint rejects invalid colors, canonicalizes unrelated parameters and returns a cacheable 1200×630 PNG', async () => {
  const origin = 'https://fandeck.ashwin.co.in/api/og?';
  assert.equal((await GET(new Request(`${origin}c=bad`))).status, 400);
  const redirect = await GET(new Request(`${origin}${query}&v=1&noise=20`));
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), `${origin}${query}&v=1`);
  const response = await GET(new Request(`${origin}${query}&v=1`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(
    response.headers.get('cache-control'),
    'public, max-age=86400, s-maxage=31536000, immutable',
  );
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
