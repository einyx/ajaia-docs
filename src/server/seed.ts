import type { Db } from './db.ts';
import { countDocuments, createDocument, upsertShare } from './repo.ts';
import { SEED_ACCOUNTS } from '../shared/constants.ts';

export const SEED_USERS = SEED_ACCOUNTS;

const WELCOME_HTML = `
<h1>Welcome to Ajaia Docs</h1>
<p>Ajaia Docs is a deliberately small collaborative editor: one focused slice of the
Google Docs surface, built end to end — editor, persistence, sharing and deployment.</p>
<h2>What works today</h2>
<ul>
  <li><strong>Rich text</strong> with bold, italic, underline, headings, lists and block quotes.</li>
  <li><strong>Autosave</strong> — every keystroke is persisted, so a refresh never loses work.</li>
  <li><strong>File import</strong> from <code>.md</code>, <code>.txt</code> and <code>.docx</code>.</li>
  <li><strong>Sharing</strong> with an owner, an editor and a viewer role.</li>
</ul>
<h2>Try the sharing flow</h2>
<p>Open <em>Share</em> and grant <strong>maya@ajaia.dev</strong> access, then sign in as Maya
from the avatar menu to see this document under “Shared with me”.</p>
<blockquote><p>Everything in this demo is mocked auth on purpose — see the README for the exact model.</p></blockquote>
`;

const NOTES_HTML = `
<h1>Q3 Product Notes</h1>
<h2>Decisions</h2>
<ol>
  <li>Ship the editor slice before adding presence indicators.</li>
  <li>Keep the access model explicit: owner, editor, viewer.</li>
  <li>Persist everything — no local-only state.</li>
</ol>
<h2>Open questions</h2>
<ul>
  <li><u>Conflict resolution</u> when two editors type at once.</li>
  <li>Document version history and a real diff view.</li>
  <li>PDF export for review packets.</li>
</ul>
`;

/**
 * Idempotent bootstrap: creates the demo accounts, a couple of sample documents
 * and one pre-made share, so the app is never an empty shell on first run.
 */
export async function ensureSeed(db: Db): Promise<void> {
  const now = Date.now();

  for (const user of SEED_USERS) {
    await db.run(
      'INSERT INTO users (email, name, color, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING',
      [user.email, user.name, user.color, now],
    );
  }

  const owner = await db.first<{ id: number }>('SELECT id FROM users WHERE email = ?', [SEED_USERS[0].email]);
  if (!owner) return;

  if ((await countDocuments(db, owner.id)) === 0) {
    await createDocument(db, {
      id: crypto.randomUUID(),
      ownerId: owner.id,
      title: 'Welcome to Ajaia Docs',
      content: WELCOME_HTML.trim(),
      plainText: 'Welcome to Ajaia Docs',
      now,
    });
    await createDocument(db, {
      id: crypto.randomUUID(),
      ownerId: owner.id,
      title: 'Q3 Product Notes',
      content: NOTES_HTML.trim(),
      plainText: 'Q3 Product Notes',
      now,
    });
  }

  const maya = await db.first<{ id: number }>('SELECT id FROM users WHERE email = ?', [SEED_USERS[1].email]);
  if (maya) {
    const welcome = await db.first<{ id: string }>(
      'SELECT id FROM documents WHERE owner_id = ? AND title = ? LIMIT 1',
      [owner.id, 'Welcome to Ajaia Docs'],
    );
    if (welcome) await upsertShare(db, welcome.id, maya.id, 'editor', now);
  }
}
