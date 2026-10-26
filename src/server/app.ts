import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from './db.ts';
import type { Role, ShareRole } from '../shared/types.ts';
import * as repo from './repo.ts';
import type { DocumentWithOwner, UserRow } from './repo.ts';

const SESSION_COOKIE = 'ajaia_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 1_000_000; // ~1 MB of HTML per document
const MAX_VERSIONS = 30; // snapshots kept per document
const VERSION_WINDOW_MS = 15_000; // edits inside one window collapse into one version

type AppEnv = { Variables: { user: UserRow | null } };

type Access =
  | { ok: true; doc: DocumentWithOwner; role: Role }
  | { ok: false; status: 404 | 403; message: string; code: string };

function errorBody(message: string, code: string) {
  return { error: { message, code } };
}

/** Strip markup to a flat, searchable string. */
function plainTextOf(content: string): string {
  return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toSummary(doc: DocumentWithOwner, role: Role) {
  return {
    id: doc.id,
    title: doc.title,
    role,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    owner: {
      id: doc.owner_id,
      name: doc.owner_name,
      email: doc.owner_email,
      color: doc.owner_color,
    },
  };
}

function toPublicUser(user: { id: number; name: string; email: string; color: string }) {
  return { id: user.id, name: user.name, email: user.email, color: user.color };
}

function toVersionAuthor(version: {
  user_id: number | null;
  name?: string | null;
  email?: string | null;
  color?: string | null;
}) {
  if (version.user_id === null) return null;
  return {
    id: version.user_id,
    name: version.name ?? 'Unknown',
    email: version.email ?? '',
    color: version.color ?? '#8e8e93',
  };
}

export function createApp(db: Db) {
  const app = new Hono<AppEnv>();

  // Resolve the session cookie into a user for every API call.
  app.use('/api/*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set('user', token ? await repo.findUserBySession(db, token) : null);
    await next();
  });

  app.onError((err, c) => {
    console.error('[ajaia] unhandled error', err);
    return c.json(errorBody('Something went wrong on our side.', 'internal_error'), 500);
  });

  const currentUser = (c: { get: (k: 'user') => UserRow | null }) => c.get('user');

  /**
   * Snapshot the document content so an earlier state can be restored.
   *
   * Autosave fires often, so edits inside one window collapse into a single
   * version: the history shows checkpoints, not keystrokes.
   */
  async function recordVersion(
    documentId: string,
    userId: number,
    content: string,
    now: number,
    force = false,
  ): Promise<void> {
    const latest = await repo.getLatestVersion(db, documentId);
    if (latest && latest.content === content) return; // nothing new to record
    if (!force && latest && now - latest.created_at < VERSION_WINDOW_MS) return;

    await repo.createVersion(db, {
      documentId,
      userId,
      content,
      excerpt: plainTextOf(content).slice(0, 240),
      now,
    });
    await repo.pruneVersions(db, documentId, MAX_VERSIONS);
  }

  async function accessFor(docId: string, user: UserRow): Promise<Access> {
    const doc = await repo.getDocument(db, docId);
    if (!doc) {
      return { ok: false, status: 404, message: 'Document not found.', code: 'not_found' };
    }
    if (doc.owner_id === user.id) return { ok: true, doc, role: 'owner' };

    const share = await repo.getShare(db, docId, user.id);
    if (!share) {
      return {
        ok: false,
        status: 403,
        message: 'You do not have access to this document.',
        code: 'forbidden',
      };
    }
    return { ok: true, doc, role: share.role };
  }

  // ---------------------------------------------------------------- auth ---

  app.get('/api/health', (c) => c.json({ ok: true, service: 'ajaia-docs' }));

  app.post('/api/auth/login', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody('Expected a JSON body.', 'invalid_body'), 400);
    }

    const email = typeof body === 'object' && body !== null ? (body as { email?: unknown }).email : undefined;
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return c.json(errorBody('Enter a valid email address.', 'invalid_email'), 400);
    }

    const user = await repo.findUserByEmail(db, email.trim());
    if (!user) {
      return c.json(
        errorBody(
          `No account for ${email.trim()}. Use one of the seeded accounts on the sign-in screen.`,
          'unknown_user',
        ),
        404,
      );
    }

    const token = newSessionToken();
    await repo.createSession(db, token, user.id, Date.now());
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
      secure: new URL(c.req.url).protocol === 'https:',
    });

    return c.json({ user: toPublicUser(user) });
  });

  app.post('/api/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await repo.deleteSession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);
    return c.json({ user: toPublicUser(user) });
  });

  app.get('/api/users', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);
    const users = await repo.listUsers(db);
    return c.json({ users: users.map(toPublicUser) });
  });

  // ----------------------------------------------------------- documents ---

  app.get('/api/documents', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const owned = await repo.listOwnedDocuments(db, user.id);
    const shared = await repo.listSharedDocuments(db, user.id);
    return c.json({
      owned: owned.map((doc) => toSummary(doc, 'owner')),
      shared: shared.map((doc) => toSummary(doc, doc.role)),
    });
  });

  app.post('/api/documents', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    let body: unknown = {};
    try {
      body = (await c.req.json()) ?? {};
    } catch {
      return c.json(errorBody('Expected a JSON body.', 'invalid_body'), 400);
    }
    const payload = body as { title?: unknown; content?: unknown };

    const title =
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim().slice(0, MAX_TITLE_LENGTH)
        : 'Untitled document';

    if (payload.content !== undefined && typeof payload.content !== 'string') {
      return c.json(errorBody('Content must be a string.', 'invalid_content'), 400);
    }
    if (typeof payload.content === 'string' && payload.content.length > MAX_CONTENT_LENGTH) {
      return c.json(errorBody('That document is too large (1 MB max).', 'content_too_large'), 413);
    }

    const now = Date.now();
    const id = crypto.randomUUID();
    const content = typeof payload.content === 'string' ? payload.content : '';
    await repo.createDocument(db, {
      id,
      ownerId: user.id,
      title,
      content,
      now,
    });

    const doc = await repo.getDocument(db, id);
    return c.json({ document: { ...toSummary(doc!, 'owner'), content } }, 201);
  });

  app.get('/api/documents/:id', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);

    return c.json({ document: { ...toSummary(access.doc, access.role), content: access.doc.content } });
  });

  app.patch('/api/documents/:id', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);
    if (access.role === 'viewer') {
      return c.json(errorBody('You have view-only access to this document.', 'read_only'), 403);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody('Expected a JSON body.', 'invalid_body'), 400);
    }
    const payload = body as { title?: unknown; content?: unknown };

    const patch: { title?: string; content?: string; now: number } = { now: Date.now() };

    if (payload.title !== undefined) {
      if (typeof payload.title !== 'string') {
        return c.json(errorBody('Title must be a string.', 'invalid_title'), 400);
      }
      patch.title = payload.title.trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled document';
    }
    if (payload.content !== undefined) {
      if (typeof payload.content !== 'string') {
        return c.json(errorBody('Content must be a string.', 'invalid_content'), 400);
      }
      if (payload.content.length > MAX_CONTENT_LENGTH) {
        return c.json(errorBody('That document is too large (1 MB max).', 'content_too_large'), 413);
      }
      patch.content = payload.content;
    }

    await repo.updateDocument(db, access.doc.id, patch);
    if (patch.content !== undefined && patch.content !== access.doc.content) {
      await recordVersion(access.doc.id, user.id, patch.content, patch.now);
    }
    const doc = await repo.getDocument(db, access.doc.id);
    return c.json({ document: { ...toSummary(doc!, access.role), content: doc!.content } });
  });

  app.delete('/api/documents/:id', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);
    if (access.role !== 'owner') {
      return c.json(errorBody('Only the owner can delete this document.', 'forbidden'), 403);
    }

    await repo.deleteDocument(db, access.doc.id);
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------- shares ---

  app.get('/api/documents/:id/shares', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);

    const shares = await repo.listShares(db, access.doc.id);
    return c.json({
      owner: toPublicUser({
        id: access.doc.owner_id,
        name: access.doc.owner_name,
        email: access.doc.owner_email,
        color: access.doc.owner_color,
      }),
      shares: shares.map((share) => ({
        user: toPublicUser({ id: share.user_id, name: share.name, email: share.email, color: share.color }),
        role: share.role,
        createdAt: share.created_at,
      })),
    });
  });

  app.post('/api/documents/:id/shares', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);
    if (access.role !== 'owner') {
      return c.json(errorBody('Only the owner can share this document.', 'forbidden'), 403);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody('Expected a JSON body.', 'invalid_body'), 400);
    }
    const payload = body as { email?: unknown; role?: unknown };

    if (typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
      return c.json(errorBody('Enter a valid email address.', 'invalid_email'), 400);
    }
    const role = payload.role ?? 'editor';
    if (role !== 'editor' && role !== 'viewer') {
      return c.json(errorBody('Role must be "editor" or "viewer".', 'invalid_role'), 400);
    }

    const target = await repo.findUserByEmail(db, payload.email.trim());
    if (!target) {
      return c.json(
        errorBody(`No account for ${payload.email.trim()}. Try maya@ajaia.dev or sam@ajaia.dev.`, 'unknown_user'),
        404,
      );
    }
    if (target.id === access.doc.owner_id) {
      return c.json(errorBody('The owner already has full access.', 'already_owner'), 400);
    }

    await repo.upsertShare(db, access.doc.id, target.id, role as ShareRole, Date.now());
    const shares = await repo.listShares(db, access.doc.id);
    return c.json({
      shares: shares.map((share) => ({
        user: toPublicUser({ id: share.user_id, name: share.name, email: share.email, color: share.color }),
        role: share.role,
        createdAt: share.created_at,
      })),
    });
  });

  app.delete('/api/documents/:id/shares/:userId', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);
    if (access.role !== 'owner') {
      return c.json(errorBody('Only the owner can change access.', 'forbidden'), 403);
    }

    const userId = Number(c.req.param('userId'));
    if (!Number.isInteger(userId)) {
      return c.json(errorBody('Invalid user id.', 'invalid_user'), 400);
    }

    await repo.deleteShare(db, access.doc.id, userId);
    const shares = await repo.listShares(db, access.doc.id);
    return c.json({
      shares: shares.map((share) => ({
        user: toPublicUser({ id: share.user_id, name: share.name, email: share.email, color: share.color }),
        role: share.role,
        createdAt: share.created_at,
      })),
    });
  });

  // ------------------------------------------------------------ versions ---

  app.get('/api/documents/:id/versions', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);

    const versions = await repo.listVersions(db, access.doc.id);
    return c.json({
      versions: versions.map((version) => ({
        id: version.id,
        createdAt: version.created_at,
        excerpt: version.excerpt,
        author: toVersionAuthor(version),
      })),
    });
  });

  // The full snapshot, so the client can diff it against the current document.
  app.get('/api/documents/:id/versions/:versionId', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);

    const versionId = Number(c.req.param('versionId'));
    if (!Number.isInteger(versionId)) {
      return c.json(errorBody('Invalid version id.', 'invalid_version'), 400);
    }

    const version = await repo.getVersion(db, access.doc.id, versionId);
    if (!version) return c.json(errorBody('That version no longer exists.', 'not_found'), 404);

    return c.json({
      version: {
        id: version.id,
        createdAt: version.created_at,
        excerpt: version.excerpt,
        content: version.content,
        author: toVersionAuthor(version),
      },
    });
  });

  app.post('/api/documents/:id/versions/:versionId/restore', async (c) => {
    const user = currentUser(c);
    if (!user) return c.json(errorBody('Sign in to continue.', 'unauthenticated'), 401);

    const access = await accessFor(c.req.param('id'), user);
    if (!access.ok) return c.json(errorBody(access.message, access.code), access.status);
    if (access.role === 'viewer') {
      return c.json(errorBody('You have view-only access to this document.', 'read_only'), 403);
    }

    const versionId = Number(c.req.param('versionId'));
    if (!Number.isInteger(versionId)) {
      return c.json(errorBody('Invalid version id.', 'invalid_version'), 400);
    }

    const version = await repo.getVersion(db, access.doc.id, versionId);
    if (!version) return c.json(errorBody('That version no longer exists.', 'not_found'), 404);

    const now = Date.now();
    await repo.updateDocument(db, access.doc.id, {
      content: version.content,
      now,
    });
    await recordVersion(access.doc.id, user.id, version.content, now, true);

    const doc = await repo.getDocument(db, access.doc.id);
    return c.json({ document: { ...toSummary(doc!, access.role), content: doc!.content } });
  });

  app.notFound((c) => c.json(errorBody('Not found.', 'not_found'), 404));

  return app;
}
