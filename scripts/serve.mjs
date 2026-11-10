// Minimal static server for local development (fetch() does not work over file://).
// Supports HTTP Range requests, so video seeking works the way it does on GitHub Pages.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
};

/** Parses a single "bytes=start-end" range. Returns null when absent, 'invalid' when unsatisfiable. */
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start;
  let end;
  if (m[1] === '') {
    // suffix range: the last N bytes
    const n = Number(m[2]);
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : { start, end };
}

export const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    let file = path.join(ROOT, decodeURIComponent(pathname));
    if (!file.startsWith(ROOT)) throw Object.assign(new Error('forbidden'), { status: 403 });
    let info = await stat(file);
    if (info.isDirectory()) {
      file = path.join(file, 'index.html');
      info = await stat(file);
    }
    const headers = {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'accept-ranges': 'bytes',
    };
    const range = parseRange(req.headers.range, info.size);
    if (range === 'invalid') {
      res.writeHead(416, { 'content-range': `bytes */${info.size}` });
      res.end();
      return;
    }
    if (range) {
      res.writeHead(206, {
        ...headers,
        'content-range': `bytes ${range.start}-${range.end}/${info.size}`,
        'content-length': range.end - range.start + 1,
      });
      createReadStream(file, range).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'content-length': info.size });
      createReadStream(file).pipe(res);
    }
  } catch (err) {
    res.writeHead(err.status ?? 404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(err.status === 403 ? 'Forbidden' : 'Not found');
  }
});

// Only listen when run directly, so tests can import parseRange without opening a port.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`Serving on http://localhost:${PORT}/`));
}
