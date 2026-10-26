/**
 * Local development server: same Hono app, same SQL, but backed by a local
 * SQLite file (node:sqlite) instead of Cloudflare D1.
 *
 *   npm run dev:api   -> http://localhost:8787
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { sqliteAdapter } from './db.ts';
import { ensureSeed } from './seed.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dbPath = resolve(root, 'data/ajaia.db');

mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(readFileSync(resolve(root, 'migrations/0001_init.sql'), 'utf8'));

await ensureSeed(sqliteAdapter(db));

const app = createApp(sqliteAdapter(db));
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[ajaia] api listening on http://localhost:${info.port}`);
});
