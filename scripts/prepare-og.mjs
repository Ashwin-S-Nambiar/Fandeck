import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const entry = require.resolve('@vercel/og');
const marker = 'const require = ogCreateRequire(import.meta.url);';
const source = await readFile(entry, 'utf8');
if (!source.includes(marker) && source.includes('var fs3 = __require("fs")')) {
  await writeFile(
    entry,
    `import { createRequire as ogCreateRequire } from 'node:module';
import { fileURLToPath as ogFileURLToPath } from 'node:url';
import { dirname as ogDirname } from 'node:path';
const require = ogCreateRequire(import.meta.url);
const __filename = ogFileURLToPath(import.meta.url);
const __dirname = ogDirname(__filename);
${source}`,
  );
}

const ogRequire = createRequire(require.resolve('@vercel/og/package.json'));
const satoriRequire = createRequire(ogRequire.resolve('satori/package.json'));
await copyFile(
  join(dirname(satoriRequire.resolve('harfbuzzjs')), 'hb.wasm'),
  join(dirname(entry), 'hb.wasm'),
);
