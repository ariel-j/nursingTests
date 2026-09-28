// Minimal static server for local development (fetch() does not work over file://).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    let file = path.join(ROOT, decodeURIComponent(pathname));
    if (!file.startsWith(ROOT)) throw Object.assign(new Error('forbidden'), { status: 403 });
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.status ?? 404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(err.status === 403 ? 'Forbidden' : 'Not found');
  }
}).listen(PORT, () => console.log(`Serving on http://localhost:${PORT}/`));
