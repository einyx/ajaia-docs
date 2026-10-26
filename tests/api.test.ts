import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { sqliteAdapter } from '../src/server/db.ts';
import { ensureSeed } from '../src/server/seed.ts';

const SCHEMA = readFileSync(resolve(process.cwd(), 'migrations/0001_init.sql'), 'utf8');
const ALICE = 'alessio@linux.com';
const MAYA = 'maya@ajaia.dev';

let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
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
