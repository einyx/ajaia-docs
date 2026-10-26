# Ajaia Docs

A lightweight collaborative document editor — one focused slice of the Google Docs surface,
built end to end: editing, persistence, file import, sharing and deployment.

**Live app:** <https://ajaia-docs.alessio-2b5.workers.dev>

> This is a self-contained demo of an internal productivity tool. Auth is mocked on purpose
> (seeded accounts, no passwords) so reviewers can jump straight into the product.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` starts two processes:

| Process | Port | What it does |
| --- | --- | --- |
| Vite dev server | 5173 | React SPA with HMR, proxies `/api` → 8787 |
| Local API | 8787 | Same Hono app, backed by a local SQLite file (`data/ajaia.db`) |

The local API creates the schema and seeds the demo accounts on first boot.

### Seeded accounts

| Account | Role in the demo |
| --- | --- |
| `alessio@linux.com` | Owner — owns the two seeded documents |
| `maya@ajaia.dev` | Editor on the seeded welcome document |
| `sam@ajaia.dev` | Observer — useful for testing the viewer role |

Sign in from the login screen (no password needed) or POST `{"email":"…"}` to `/api/auth/login`.

### Tests

```bash
npm test          # vitest — 22 tests over the API surface and the save queue
npm run typecheck # tsc --noEmit
```

The tests cover the parts that carry the product's risk: authentication, document persistence,
the sharing matrix (owner / editor / viewer), request validation, version history, and the
per-document save queue that retries a failed save against the right document.

### Walkthrough video

The video in `docs/walkthrough.mp4` is generated, not hand-recorded:

```bash
OPENAI_API_KEY=sk-... node scripts/narrate.mjs --prepare  # synthesise the voice-over
node scripts/walkthrough.mjs                              # record the app, paced to the audio
OPENAI_API_KEY=sk-... node scripts/narrate.mjs            # mix narration onto the capture
```

`scripts/narration-script.mjs` holds the script; the on-screen captions and the voice-over
come from the same source, so they cannot drift apart.

### Deploying

```bash
npx wrangler login                    # once, in a terminal
npm run db:migrate:remote             # apply migrations/ to D1
npm run deploy                        # vite build + wrangler deploy
```

`wrangler.jsonc` pins the D1 database id. To point at your own account, change `account_id`
and `database_id` (create the database with `npx wrangler d1 create ajaia`).

---

## What it does

### Documents
- Create, rename, delete and reopen documents; sidebar separates **My documents** from **Shared with me**.
- Rich text via TipTap: **bold, italic, underline, strikethrough, H1–H3, bulleted and numbered
  lists, block quotes, code blocks, links, horizontal rules**, plus undo/redo.
- **Autosave** — edits are persisted 700 ms after you stop typing, flushed when the tab is
  hidden, and shown as `Saving… / Saved / Save failed` in the header. Content is stored as
  semantic HTML, so formatting survives a reload.
- Search across titles, Markdown/plain-text export from the `⋯` menu.

### Version history
- Every meaningful edit is **snapshotted**; the `⋯` menu → *Version history* opens a panel
  listing each snapshot with its author, age and a preview of the text.
- **Restore** puts an earlier snapshot back. The restore is written to the document and
  recorded as a new version, so the history never loses the state you came from.
- Autosave fires often, so snapshots inside a **15-second window collapse into one** — the
  history shows checkpoints rather than keystrokes. The newest 30 snapshots are kept.
- Reading the history is allowed for anyone with access; **restoring requires owner or
  editor** — a viewer sees the list without a restore button, and the API answers
  `403 read_only` if one tries anyway.

### File import
Import turns a file into a **new editable document** (it does not attach to an existing one):

| Type | Handling | Limit |
| --- | --- | --- |
| `.md` / `.markdown` | Parsed with `marked` → editor content | 1 MB per document |
| `.txt` | Blank-line separated paragraphs, single newlines → `<br>` | 1 MB per document |
| `.docx` | Parsed with `mammoth` in the browser → editor content | 1 MB per document |

Parsing happens **client side**, the result is sanitised with DOMPurify before it reaches the
API, and other file types are rejected with a clear message in the UI.

### Sharing
- A document has one **owner** and any number of **shared users** with a role:
  **editor** (read + write) or **viewer** (read only).
- The owner grants access by email and can change or revoke it; shared users see the document
  under “Shared with me” with their role.
- **Access is enforced on the server for every request** — not just hidden in the UI. A viewer
  gets `403 read_only` if they try to write; a non-sharee gets `403 forbidden` on read, write
  and delete; only the owner can delete or change access.

---

## API

All routes are under `/api` and return JSON. Errors are `{ "error": { "message", "code" } }`.

| Method | Route | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `{email}` → session cookie (`HttpOnly`, `SameSite=Lax`) |
| `POST` | `/api/auth/logout` | Clears the session |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/users` | Seeded accounts (for the share picker) |
| `GET` | `/api/documents` | `{owned: [], shared: []}` |
| `POST` | `/api/documents` | `{title?, content?}` → new document |
| `GET` | `/api/documents/:id` | Document + your role |
| `PATCH` | `/api/documents/:id` | `{title?, content?, plainText?}` — owner/editor only |
| `DELETE` | `/api/documents/:id` | Owner only |
| `GET` | `/api/documents/:id/shares` | Owner + shared users |
| `POST` | `/api/documents/:id/shares` | `{email, role}` — owner only |
| `DELETE` | `/api/documents/:id/shares/:userId` | Owner only |
| `GET` | `/api/documents/:id/versions` | Snapshots, newest first (read: owner / editor / viewer) |
| `POST` | `/api/documents/:id/versions/:versionId/restore` | Restore a snapshot — owner / editor only |

Validation is explicit: emails must look like emails, roles must be `editor` or `viewer`,
titles are trimmed and capped at 200 characters, document content is capped at 1 MB
(`413 content_too_large`), and unknown accounts return `404 unknown_user`.

## Data model

SQLite (Cloudflare D1 in production, `node:sqlite` locally — the same SQL runs on both).

```
users(id, email, name, color, created_at)
sessions(token, user_id, created_at)
documents(id, owner_id, title, content, plain_text, created_at, updated_at)
document_shares(document_id, user_id, role, created_at)   -- role: editor | viewer
document_versions(id, document_id, user_id, content, excerpt, created_at)
```

Schema: [`migrations/0001_init.sql`](migrations/0001_init.sql) plus
[`migrations/0003_document_versions.sql`](migrations/0003_document_versions.sql). Local dev and
the test suite read every migration in `migrations/` in order, so they cannot drift from D1.

---

## Security model (what is real and what is mocked)

**Real:** server-side authorisation on every document route; `HttpOnly` session cookies;
parameterised SQL; input validation and size limits; HTML sanitisation on import; role checks
that the UI cannot bypass.

**Mocked (deliberately, for a demo):** no passwords and no email verification — signing in with
a seeded email creates a session. There is no rate limiting, no CSRF token, and no audit log.
The session cookie is `SameSite=Lax` without `Secure` in local development. Before this went
near real data it would need passwordless/OIDC auth, CSRF protection, rate limiting and an
audit trail — see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Design

The interface follows Apple's Human Interface Guidelines: system semantic colours, Apple text
styles (body 17/22, title 28/34 …), SF-style system font stack, 44 pt minimum touch targets,
and a Liquid Glass navigation layer (floating sidebar, unified toolbar, sheets and menus) that
collapses to solid surfaces under `prefers-reduced-transparency` / `prefers-contrast: more` and
respects `prefers-reduced-motion`. Dark mode follows `prefers-color-scheme`.
The document canvas stays opaque — glass is reserved for the navigation layer.

## Repository layout

```
src/client/     React SPA (editor, sidebar, share sheet, login)
src/server/     Hono app, storage adapter, SQL repository, seeding
src/shared/     Types and constants shared by both sides
migrations/     D1 / SQLite schema
scripts/        dev runner, walkthrough recorder, submission packaging
tests/          vitest suite over the API
```

More detail: [`ARCHITECTURE.md`](ARCHITECTURE.md) · AI workflow: [`AI-WORKFLOW.md`](AI-WORKFLOW.md)
· submission index: [`SUBMISSION.md`](SUBMISSION.md)
