import { readFile } from 'node:fs/promises';
import { sharedPalette } from '../js/share.js';
import { shareHtml } from '../server/html.js';

let shell;
export async function GET(request) {
  shell ??= readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const palette = sharedPalette(new URL(request.url).searchParams);
  return new Response(palette ? shareHtml(await shell, palette) : await shell, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control':
        'max-age=86400, stale-while-revalidate=604800',
    },
  });
}
