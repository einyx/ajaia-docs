import type { Db } from './db.ts';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  color: string;
  created_at: number;
}

export interface DocumentRow {
  id: string;
  owner_id: number;
  title: string;
  content: string;
  plain_text: string;
  created_at: number;
  updated_at: number;
}

export interface ShareRow {
  document_id: string;
  user_id: number;
  role: 'editor' | 'viewer';
  created_at: number;
}

export interface DocumentWithOwner extends DocumentRow {
  owner_name: string;
  owner_email: string;
  owner_color: string;
}

export interface VersionRow {
  id: number;
  document_id: string;
  user_id: number | null;
  content: string;
  excerpt: string;
  created_at: number;
}

export interface VersionWithAuthor extends VersionRow {
  name: string | null;
  email: string | null;
  color: string | null;
}

const USER_COLUMNS = 'id, email, name, color, created_at';

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  return db.first<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [email.toLowerCase()]);
}

export async function listUsers(db: Db): Promise<UserRow[]> {
  return db.all<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY name`);
}

export async function createSession(db: Db, token: string, userId: number, now: number): Promise<void> {
  await db.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', [token, userId, now]);
}

export async function findUserBySession(db: Db, token: string): Promise<UserRow | null> {
  return db.first<UserRow>(
    `SELECT u.id, u.email, u.name, u.color, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`,
    [token],
  );
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

export async function listOwnedDocuments(db: Db, ownerId: number): Promise<DocumentWithOwner[]> {
  return db.all<DocumentWithOwner>(
    `SELECT d.*, u.name AS owner_name, u.email AS owner_email, u.color AS owner_color
       FROM documents d JOIN users u ON u.id = d.owner_id
      WHERE d.owner_id = ? ORDER BY d.updated_at DESC`,
    [ownerId],
  );
}

export async function listSharedDocuments(db: Db, userId: number): Promise<(DocumentWithOwner & { role: 'editor' | 'viewer' })[]> {
  return db.all<DocumentWithOwner & { role: 'editor' | 'viewer' }>(
    `SELECT d.*, u.name AS owner_name, u.email AS owner_email, u.color AS owner_color, s.role AS role
       FROM document_shares s
       JOIN documents d ON d.id = s.document_id
       JOIN users u ON u.id = d.owner_id
      WHERE s.user_id = ? ORDER BY d.updated_at DESC`,
    [userId],
  );
}

export async function getDocument(db: Db, id: string): Promise<DocumentWithOwner | null> {
  return db.first<DocumentWithOwner>(
    `SELECT d.*, u.name AS owner_name, u.email AS owner_email, u.color AS owner_color
       FROM documents d JOIN users u ON u.id = d.owner_id
      WHERE d.id = ?`,
    [id],
  );
}

export async function getShare(db: Db, documentId: string, userId: number): Promise<ShareRow | null> {
  return db.first<ShareRow>('SELECT * FROM document_shares WHERE document_id = ? AND user_id = ?', [
    documentId,
    userId,
  ]);
}

export async function listShares(db: Db, documentId: string): Promise<(ShareRow & { name: string; email: string; color: string })[]> {
  return db.all<ShareRow & { name: string; email: string; color: string }>(
    `SELECT s.*, u.name, u.email, u.color
       FROM document_shares s JOIN users u ON u.id = s.user_id
      WHERE s.document_id = ? ORDER BY s.created_at`,
    [documentId],
  );
}

export async function createDocument(
  db: Db,
  doc: { id: string; ownerId: number; title: string; content: string; plainText?: string; now: number },
): Promise<void> {
  await db.run(
    `INSERT INTO documents (id, owner_id, title, content, plain_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [doc.id, doc.ownerId, doc.title, doc.content, doc.plainText ?? '', doc.now, doc.now],
  );
}

export async function updateDocument(
  db: Db,
  id: string,
  patch: { title?: string; content?: string; plainText?: string; now: number },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if (patch.content !== undefined) {
    sets.push('content = ?');
    params.push(patch.content);
  }
  if (patch.plainText !== undefined) {
    sets.push('plain_text = ?');
    params.push(patch.plainText);
  }
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(patch.now, id);

  await db.run(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function deleteDocument(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM documents WHERE id = ?', [id]);
}

export async function upsertShare(
  db: Db,
  documentId: string,
  userId: number,
  role: 'editor' | 'viewer',
  now: number,
): Promise<void> {
  await db.run(
    `INSERT INTO document_shares (document_id, user_id, role, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`,
    [documentId, userId, role, now],
  );
}

export async function deleteShare(db: Db, documentId: string, userId: number): Promise<void> {
  await db.run('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?', [documentId, userId]);
}

export async function countDocuments(db: Db, ownerId: number): Promise<number> {
  const row = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM documents WHERE owner_id = ?', [ownerId]);
  return Number(row?.n ?? 0);
}

// -------------------------------------------------------------- versions ---

export async function createVersion(
  db: Db,
  version: { documentId: string; userId: number; content: string; excerpt: string; now: number },
): Promise<void> {
  await db.run(
    `INSERT INTO document_versions (document_id, user_id, content, excerpt, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [version.documentId, version.userId, version.content, version.excerpt, version.now],
  );
}

export async function getLatestVersion(db: Db, documentId: string): Promise<VersionRow | null> {
  return db.first<VersionRow>(
    'SELECT * FROM document_versions WHERE document_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    [documentId],
  );
}

export async function getVersion(db: Db, documentId: string, id: number): Promise<VersionRow | null> {
  return db.first<VersionRow>('SELECT * FROM document_versions WHERE document_id = ? AND id = ?', [
    documentId,
    id,
  ]);
}

export async function listVersions(db: Db, documentId: string): Promise<VersionWithAuthor[]> {
  return db.all<VersionWithAuthor>(
    `SELECT v.*, u.name, u.email, u.color
       FROM document_versions v LEFT JOIN users u ON u.id = v.user_id
      WHERE v.document_id = ? ORDER BY v.created_at DESC, v.id DESC`,
    [documentId],
  );
}

/** Keep only the newest `keep` versions of a document; older ones are dropped. */
export async function pruneVersions(db: Db, documentId: string, keep: number): Promise<void> {
  await db.run(
    `DELETE FROM document_versions
      WHERE document_id = ?
        AND id NOT IN (
          SELECT id FROM document_versions WHERE document_id = ?
          ORDER BY created_at DESC, id DESC LIMIT ?
        )`,
    [documentId, documentId, keep],
  );
}
