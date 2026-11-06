import { mkdir, readFile, readdir, rm, copyFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist');
const html = await readFile(join(root, 'index.html'), 'utf8');
for (const field of ['<title>', 'name="description"', 'property="og:title"', 'property="og:image"', 'rel="icon"']) {
  if (!html.includes(field)) throw new Error(`Missing required metadata: ${field}`);
}
for (const asset of ['favicon.svg', 'og-image.png']) await stat(join(root, 'assets', asset));
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets'), { recursive: true });
await copyFile(join(root, 'index.html'), join(output, 'index.html'));
for (const asset of ['favicon.svg', 'og-image.png']) await copyFile(join(root, 'assets', asset), join(output, 'assets', asset));
let bytes = (await stat(join(output, 'index.html'))).size;
for (const asset of await readdir(join(output, 'assets'))) bytes += (await stat(join(output, 'assets', asset))).size;
console.log(`Built dist/index.html and 2 local metadata assets (${bytes.toLocaleString('en-US')} bytes). CSS, JavaScript, and game artwork are inline.`);
