/**
 * Storage abstraction.
 *
 * The app runs on two backends that speak the same dialect:
 *  - Cloudflare D1 (production): SQL over a remote SQLite database.
 *  - node:sqlite (local development + tests): the same SQL over a local file.
 *
 * Only positional (`?`) parameters are used so a single SQL string works on both.
 */

export interface Db {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastRowId: number }>;
}

/** The slice of the Cloudflare D1 API this app depends on. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1Statement;
}

export function d1Adapter(db: D1DatabaseLike): Db {
  const bind = (sql: string, params: unknown[]) => {
    const stmt = db.prepare(sql);
    return params.length ? stmt.bind(...params) : stmt;
  };

  return {
    async all<T>(sql: string, params: unknown[] = []) {
      const res = await bind(sql, params).all<T>();
      return res.results ?? [];
    },
    async first<T>(sql: string, params: unknown[] = []) {
      return (await bind(sql, params).first<T>()) ?? null;
    },
    async run(sql: string, params: unknown[] = []) {
      const res = await bind(sql, params).run();
      return { changes: res.meta?.changes ?? 0, lastRowId: res.meta?.last_row_id ?? 0 };
    },
  };
}

/** node:sqlite statement surface, loosened so we can pass positional params. */
interface LooseStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export function sqliteAdapter(db: { prepare(sql: string): unknown }): Db {
  const prepare = (sql: string) => db.prepare(sql) as unknown as LooseStatement;

  return {
    async all<T>(sql: string, params: unknown[] = []) {
      return prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: unknown[] = []) {
      const row = prepare(sql).get(...params);
      return (row as T | undefined) ?? null;
    },
    async run(sql: string, params: unknown[] = []) {
      const res = prepare(sql).run(...params);
      return { changes: Number(res.changes), lastRowId: Number(res.lastInsertRowid) };
    },
  };
}
