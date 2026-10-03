import { ImageResponse } from '@vercel/og';
import { paletteImage, sharedPalette } from '../js/share.js';
import { cardAssets, paletteCard } from '../server/card.js';

export async function GET(request) {
  const url = new URL(request.url);
  const palette = sharedPalette(url.searchParams);
  if (!palette)
    return new Response('Invalid palette', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  const canonical = new URL(paletteImage(palette));
  if (url.search !== canonical.search) {
    return new Response(null, {
      status: 308,
      headers: {
        Location: canonical.href,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  const assets = await cardAssets();
  return new ImageResponse(paletteCard(palette, assets.icon), {
    width: 1200,
    height: 630,
    fonts: assets.fonts,
    headers: {
      'cache-control': 'public, max-age=86400, s-maxage=31536000, immutable',
    },
  });
}
