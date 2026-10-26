import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every migration in order — the same set `wrangler d1 migrations apply` runs.
 *
 * Local dev and the test suite read the schema from disk instead of hardcoding
 * it, so they cannot drift from what D1 ends up with.
 */
export function readSchema(migrationsDir: string): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDir, name), 'utf8'))
    .join('\n');
}
