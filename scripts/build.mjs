import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const path of [
  'index.html',
  'index.css',
  '404.html',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'site.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'og.jpg',
  'fonts',
  'js',
  'assets',
]) {
  await cp(path, `dist/${path}`, { recursive: true });
}
