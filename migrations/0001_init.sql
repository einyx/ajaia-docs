-- Ajaia Docs schema (SQLite / Cloudflare D1).
-- Applied by: wrangler d1 migrations apply ajaia [--local|--remote]

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  color       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT    PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL DEFAULT '',
  plain_text  TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares (user_id, created_at DESC);
