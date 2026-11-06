import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const portArgument = process.argv.indexOf('--port');
const port = portArgument === -1 ? 4173 : Number(process.argv[portArgument + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass a valid --port between 1 and 65535.');
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    // Serve at a subpath to exercise static gateway hosting, as well as at the root.
    const relative = path.startsWith('/preview/') ? path.slice('/preview'.length) : path;
    const file = resolve(root, `.${relative}`, relative.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Squeekchain Tap preview: http://127.0.0.1:${port}/preview/ (Ctrl+C to stop)`));
