/**
 * Standalone server: serves the built SPA and the API from one Node process.
 *
 * This is the portable path — the same Hono app and the same SQL, but running
 * on Node with a local SQLite file instead of on Cloudflare Workers + D1.
 * Used by the Docker image and by `npm run serve`.
 *
 *   npm run build && npm run serve      # http://localhost:8787
 */
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { sqliteAdapter } from './db.ts';
import { ensureSeed } from './seed.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const distDir = resolve(root, 'dist');
const dbPath = process.env.AJAIA_DB ?? resolve(root, 'data/ajaia.db');

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
if (existsSync(resolve(root, 'migrations/0001_init.sql'))) {
  db.exec(readFileSync(resolve(root, 'migrations/0001_init.sql'), 'utf8'));
}

await ensureSeed(sqliteAdapter(db));
const api = createApp(sqliteAdapter(db));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function sendFile(res: import('node:http').ServerResponse, filePath: string) {
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'content-length': statSync(filePath).size });
  createReadStream(filePath).pipe(res);
}

/** Node request → Web Request, so the same Hono app can serve it. */
async function toWebRequest(req: import('node:http').IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
  const method = req.method ?? 'GET';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry));
    else if (value !== undefined) headers.set(key, value);
  }

  let body: Buffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks);
  }

  return new Request(url, { method, headers, body: body as unknown as BodyInit | undefined });
}

const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    const response = await api.fetch(await toWebRequest(req));
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const candidate = resolve(distDir, relative);

  if (candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(res, candidate);
    return;
  }

  // SPA fallback: unknown paths render the app shell.
  const shell = join(distDir, 'index.html');
  if (existsSync(shell)) {
    sendFile(res, shell);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found. Run `npm run build` first.');
}).listen(port, () => {
  console.log(`[ajaia] http://localhost:${port}`);
});
