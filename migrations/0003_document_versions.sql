-- Ajaia Docs: document version history.
-- Content snapshots written by the API when a document is edited, so an
-- earlier state can be listed and restored.
-- Applied by: wrangler d1 migrations apply ajaia [--local|--remote]

CREATE TABLE IF NOT EXISTS document_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT    NOT NULL,
  excerpt     TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document
  ON document_versions (document_id, created_at DESC, id DESC);
