import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { sqliteAdapter } from '../src/server/db.ts';
import { readSchema } from '../src/server/schema.ts';
import { ensureSeed } from '../src/server/seed.ts';

const SCHEMA = readSchema(resolve(process.cwd(), 'migrations'));
const ALICE = 'alessio@linux.com';
const MAYA = 'maya@ajaia.dev';

let app: ReturnType<typeof createApp>;
let db: DatabaseSync;

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  // D1 enforces foreign keys by default; match it so cascades behave the same.
  db.exec('PRAGMA foreign_keys = ON;');
  const adapter = sqliteAdapter(db);
  await ensureSeed(adapter);
  app = createApp(adapter);
});

async function signIn(email: string): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie!.split(';')[0];
}

function auth(cookie: string): Record<string, string> {
  return { Cookie: cookie, 'Content-Type': 'application/json' };
}

async function createDoc(cookie: string, title = 'Spec') {
  const res = await app.request('/api/documents', {
    method: 'POST',
    body: JSON.stringify({ title }),
    headers: auth(cookie),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.document as { id: string; title: string; content: string };
}

describe('auth', () => {
  it('rejects anonymous access to the document list', async () => {
    const res = await app.request('/api/documents');
    expect(res.status).toBe(401);
  });

  it('signs in a seeded account and rejects unknown emails', async () => {
    const ok = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ALICE }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.user.email).toBe(ALICE);

    const missing = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(missing.status).toBe(404);
  });
});

describe('documents', () => {
  it('creates a document with a default title and persists formatting', async () => {
    const cookie = await signIn(ALICE);
    const doc = await createDoc(cookie, '   ');
    expect(doc.title).toBe('Untitled document');

    const content = '<h1>Launch plan</h1><p><strong>Ship</strong> it</p><ul><li>Item</li></ul>';
    const patch = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content, plainText: 'Launch plan Ship it Item' }),
      headers: auth(cookie),
    });
    expect(patch.status).toBe(200);

    const reload = await app.request(`/api/documents/${doc.id}`, { headers: { Cookie: cookie } });
    expect(reload.status).toBe(200);
    const body = await reload.json();
    expect(body.document.content).toBe(content);
  });

  it('lists owned and shared documents separately', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Shared spec');

    const share = await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: MAYA, role: 'editor' }),
      headers: auth(alice),
    });
    expect(share.status).toBe(200);

    const mayaDocs = await app.request('/api/documents', { headers: { Cookie: maya } });
    const body = await mayaDocs.json();
    expect(body.owned).toHaveLength(0);
    const sharedDoc = body.shared.find((doc: { title: string }) => doc.title === 'Shared spec');
    expect(sharedDoc).toBeTruthy();
    expect(sharedDoc.role).toBe('editor');
    expect(sharedDoc.owner.email).toBe(ALICE);
  });
});

describe('sharing and access control', () => {
  it('blocks users without access from reading or editing', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Private');

    const read = await app.request(`/api/documents/${doc.id}`, { headers: { Cookie: maya } });
    expect(read.status).toBe(403);

    const write = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'nope' }),
      headers: auth(maya),
    });
    expect(write.status).toBe(403);
  });

  it('lets an editor edit but not delete, and only the owner can delete', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Team doc');

    await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: MAYA, role: 'editor' }),
      headers: auth(alice),
    });

    const edit = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: '<p>edited by maya</p>' }),
      headers: auth(maya),
    });
    expect(edit.status).toBe(200);

    const mayaDelete = await app.request(`/api/documents/${doc.id}`, {
      method: 'DELETE',
      headers: { Cookie: maya },
    });
    expect(mayaDelete.status).toBe(403);

    const aliceDelete = await app.request(`/api/documents/${doc.id}`, {
      method: 'DELETE',
      headers: { Cookie: alice },
    });
    expect(aliceDelete.status).toBe(200);
  });

  it('enforces view-only access for viewers', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Read only');

    await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: MAYA, role: 'viewer' }),
      headers: auth(alice),
    });

    const read = await app.request(`/api/documents/${doc.id}`, { headers: { Cookie: maya } });
    expect(read.status).toBe(200);
    expect((await read.json()).document.role).toBe('viewer');

    const write = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'nope' }),
      headers: auth(maya),
    });
    expect(write.status).toBe(403);
    expect((await write.json()).error.code).toBe('read_only');

    const remove = await app.request(`/api/documents/${doc.id}`, {
      method: 'DELETE',
      headers: { Cookie: maya },
    });
    expect(remove.status).toBe(403);
  });

  it('lets only the owner grant, change and revoke access', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Access control');

    await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: MAYA, role: 'editor' }),
      headers: auth(alice),
    });

    // An editor cannot hand out access.
    const grant = await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: 'sam@ajaia.dev', role: 'viewer' }),
      headers: auth(maya),
    });
    expect(grant.status).toBe(403);
    expect((await grant.json()).error.code).toBe('forbidden');

    // The owner can see who has access.
    const ownerShares = await app.request(`/api/documents/${doc.id}/shares`, { headers: { Cookie: alice } });
    expect(ownerShares.status).toBe(200);
    const shares = (await ownerShares.json()).shares as { user: { id: number; email: string } }[];
    const mayaShare = shares.find((share) => share.user.email === MAYA);
    expect(mayaShare).toBeTruthy();

    // An editor cannot revoke access.
    const revoke = await app.request(`/api/documents/${doc.id}/shares/${mayaShare!.user.id}`, {
      method: 'DELETE',
      headers: { Cookie: maya },
    });
    expect(revoke.status).toBe(403);

    // The owner can, and the share is gone.
    const removed = await app.request(`/api/documents/${doc.id}/shares/${mayaShare!.user.id}`, {
      method: 'DELETE',
      headers: { Cookie: alice },
    });
    expect(removed.status).toBe(200);

    const after = await app.request(`/api/documents/${doc.id}`, { headers: { Cookie: maya } });
    expect(after.status).toBe(403);

    const mayaDocs = await app.request('/api/documents', { headers: { Cookie: maya } });
    const sharedIds = ((await mayaDocs.json()).shared as { id: string }[]).map((entry) => entry.id);
    expect(sharedIds).not.toContain(doc.id);
  });

  it('rejects content over the 1 MB limit', async () => {
    const alice = await signIn(ALICE);
    const doc = await createDoc(alice, 'Too big');

    const res = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'x'.repeat(1_000_001) }),
      headers: auth(alice),
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('content_too_large');
  });

  it('ends the session on logout', async () => {
    const alice = await signIn(ALICE);
    expect((await app.request('/api/auth/me', { headers: { Cookie: alice } })).status).toBe(200);

    const out = await app.request('/api/auth/logout', { method: 'POST', headers: { Cookie: alice } });
    expect(out.status).toBe(200);

    expect((await app.request('/api/auth/me', { headers: { Cookie: alice } })).status).toBe(401);
    expect((await app.request('/api/documents', { headers: { Cookie: alice } })).status).toBe(401);
  });

  it('validates share payloads', async () => {
    const alice = await signIn(ALICE);
    const doc = await createDoc(alice, 'Validation');

    const unknownUser = await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: 'ghost@example.com', role: 'editor' }),
      headers: auth(alice),
    });
    expect(unknownUser.status).toBe(404);

    const badRole = await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: MAYA, role: 'superuser' }),
      headers: auth(alice),
    });
    expect(badRole.status).toBe(400);

    const badContent = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 42 }),
      headers: auth(alice),
    });
    expect(badContent.status).toBe(400);
  });
});

describe('version history', () => {
  async function patchDoc(cookie: string, id: string, content: string) {
    const res = await app.request(`/api/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
      headers: auth(cookie),
    });
    expect(res.status).toBe(200);
  }

  async function listVersions(cookie: string, id: string) {
    const res = await app.request(`/api/documents/${id}/versions`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    return (await res.json()).versions as {
      id: number;
      createdAt: number;
      excerpt: string;
      author: { email: string } | null;
    }[];
  }

  /** Age every stored version so the next edit lands in a new window. */
  function ageVersions() {
    db.exec('UPDATE document_versions SET created_at = 0');
  }

  it('records a version when the content changes', async () => {
    const alice = await signIn(ALICE);
    const doc = await createDoc(alice, 'Versioned');

    await patchDoc(alice, doc.id, '<p>first draft</p>');

    const versions = await listVersions(alice, doc.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].excerpt).toBe('first draft');
    expect(versions[0].author?.email).toBe(ALICE);
  });

  it('collapses edits inside one window into a single version', async () => {
    const alice = await signIn(ALICE);
    const doc = await createDoc(alice, 'Busy');

    await patchDoc(alice, doc.id, '<p>one</p>');
    await patchDoc(alice, doc.id, '<p>two</p>');
    await patchDoc(alice, doc.id, '<p>three</p>');

    expect(await listVersions(alice, doc.id)).toHaveLength(1);
  });

  it('starts a new version once the window has passed', async () => {
    const alice = await signIn(ALICE);
    const doc = await createDoc(alice, 'Over time');

    await patchDoc(alice, doc.id, '<p>one</p>');
    ageVersions();
    await patchDoc(alice, doc.id, '<p>two</p>');

    const versions = await listVersions(alice, doc.id);
    expect(versions).toHaveLength(2);
    expect(versions[0].excerpt).toBe('two');
  });

  it('restores an earlier version', async () => {
    const alice = await signIn(ALICE);
    const doc = await createDoc(alice, 'Restore me');

    await patchDoc(alice, doc.id, '<p>the good draft</p>');
    ageVersions();
    await patchDoc(alice, doc.id, '<p>the bad draft</p>');

    const versions = await listVersions(alice, doc.id);
    const oldest = versions[versions.length - 1];
    expect(oldest.excerpt).toBe('the good draft');

    const restore = await app.request(`/api/documents/${doc.id}/versions/${oldest.id}/restore`, {
      method: 'POST',
      headers: { Cookie: alice },
    });
    expect(restore.status).toBe(200);

    const reload = await app.request(`/api/documents/${doc.id}`, { headers: { Cookie: alice } });
    expect((await reload.json()).document.content).toBe('<p>the good draft</p>');
  });

  it('lets a viewer read the history but not restore it', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Read only history');

    await app.request(`/api/documents/${doc.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: MAYA, role: 'viewer' }),
      headers: auth(alice),
    });
    await patchDoc(alice, doc.id, '<p>draft</p>');

    const versions = await listVersions(maya, doc.id);
    expect(versions).toHaveLength(1);

    const restore = await app.request(`/api/documents/${doc.id}/versions/${versions[0].id}/restore`, {
      method: 'POST',
      headers: { Cookie: maya },
    });
    expect(restore.status).toBe(403);
    expect((await restore.json()).error.code).toBe('read_only');
  });

  it('blocks users without access from reading or restoring history', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Private history');
    await patchDoc(alice, doc.id, '<p>secret</p>');

    const read = await app.request(`/api/documents/${doc.id}/versions`, { headers: { Cookie: maya } });
    expect(read.status).toBe(403);

    const versions = await listVersions(alice, doc.id);
    const restore = await app.request(`/api/documents/${doc.id}/versions/${versions[0].id}/restore`, {
      method: 'POST',
      headers: { Cookie: maya },
    });
    expect(restore.status).toBe(403);
  });

  it('serves one snapshot to anyone with access, and to nobody else', async () => {
    const alice = await signIn(ALICE);
    const maya = await signIn(MAYA);
    const doc = await createDoc(alice, 'Snapshot access');
    await patchDoc(alice, doc.id, '<p>snapshot body</p>');

    const versions = await listVersions(alice, doc.id);

    const read = await app.request(`/api/documents/${doc.id}/versions/${versions[0].id}`, {
      headers: { Cookie: alice },
    });
    expect(read.status).toBe(200);
    expect((await read.json()).version.content).toBe('<p>snapshot body</p>');

    const denied = await app.request(`/api/documents/${doc.id}/versions/${versions[0].id}`, {
      headers: { Cookie: maya },
    });
    expect(denied.status).toBe(403);

    const missing = await app.request(`/api/documents/${doc.id}/versions/999999`, {
      headers: { Cookie: alice },
    });
    expect(missing.status).toBe(404);
  });
});
