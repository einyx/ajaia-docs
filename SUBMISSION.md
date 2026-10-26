# SUBMISSION — Ajaia Docs

A lightweight collaborative document editor. Built for a 4–6 hour product-engineering
assignment: one coherent slice of the Google Docs surface, deployed and reviewable.

## 1. Links

| What | Where |
| --- | --- |
| **Live product** | <https://ajaia-docs.alessio-2b5.workers.dev> |
| **Walkthrough video (3–5 min, narrated)** | <https://ajaia-docs.alessio-2b5.workers.dev/walkthrough.mp4> — also at `docs/walkthrough.mp4` in the source folder |
| **Source code** | This folder (also published as a GitHub repository — see §5) |
| Setup & run instructions | [`README.md`](README.md) |
| Architecture note | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) |
| Video URL (plain text) | `walkthrough-video-url.txt` |
| Screenshots | `docs/screens/` (light and dark, 16 frames) |

## 2. What is included

```
ajaia/
├── README.md                  setup, run, API reference, security model, limits
├── ARCHITECTURE.md            what I prioritised, why, trade-offs, what is next
├── AI-WORKFLOW.md             tools used, what AI sped up, what I rejected, verification
├── SUBMISSION.md              this file
├── walkthrough-video-url.txt  the video link on its own
├── docs/
│   ├── walkthrough.mp4        narrated walkthrough (also served by the live app)
│   └── screens/               screenshots, light + dark
├── src/client/                React SPA: editor, sidebar, share sheet, login
├── src/server/                Hono API, storage adapter, SQL repository, seeding
├── src/shared/                types and constants shared by client and server
├── migrations/0001_init.sql   D1 / SQLite schema
├── scripts/                   dev runner, walkthrough recorder, narration, packaging
├── tests/api.test.ts          vitest suite over the API (8 tests)
├── wrangler.jsonc             Worker + D1 + assets configuration
└── package.json
```

## 3. How to review in 5 minutes

1. Open the live URL. You land on the sign-in screen — **no password needed**.
2. Sign in as **alessio@linux.com** (owner). You get two seeded documents.
3. Click into the text and type: bold/italic/underline work, the header shows `Saving…` then
   `Saved`, and a refresh brings the content back (it lives in Cloudflare D1).
4. Click **Share** → invite `maya@ajaia.dev` as *Can edit*.
5. Switch account (bottom-left avatar) → sign in as **maya@ajaia.dev** → the document is now
   under *Shared with me*.
6. Switch again → sign in as **sam@ajaia.dev** → open the same document → the toolbar is
   disabled and the banner says it is view-only. A direct `PATCH` to that document returns
   `403 read_only` — the rule is server-side.
7. **Import file** → drop in a `.md`, `.txt` or `.docx` file → it opens as a new editable
   document.

Accounts (mocked auth, no passwords): `alessio@linux.com`, `maya@ajaia.dev`, `sam@ajaia.dev`.

## 4. What is working / incomplete / next

**Working end to end**
- Document creation, rename, delete, reopen; documents split into *My documents* and
  *Shared with me*; title search.
- Rich text: bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists,
  block quotes, code blocks, links, horizontal rules, undo/redo.
- Autosave with visible save state; content and formatting survive reloads.
- File import: `.md`, `.txt`, `.docx` → new editable document (parsed in the browser,
  sanitised, 1 MB cap, other types rejected with a clear message).
- Sharing: owner + editor/viewer roles, role changes, revocation, server-side enforcement on
  every route, role badges in the UI.
- Markdown and plain-text export; dark mode; keyboard-accessible dialogs and menus;
  Apple HIG visual language (semantic colours, Apple text styles, Liquid Glass navigation
  layer, 44 pt touch targets, reduced-transparency/motion/contrast fallbacks).

**Incomplete or deliberately absent**
- Auth is mocked: seeded accounts, no passwords, no email verification, no CSRF token, no
  rate limiting, no audit log. The *authorisation* layer is real.
- No real-time collaboration: last-write-wins, so two simultaneous editors can overwrite each
  other. No presence indicators.
- No comments, no version history, no attachments, no PDF export.
- Import is limited to `.md`, `.txt` and `.docx`; `.docx` conversion is best-effort.
- The share picker lists seeded accounts rather than a directory of real users.

**Next 2–4 hours** (full reasoning in [`ARCHITECTURE.md`](ARCHITECTURE.md) §8)
1. Optimistic concurrency + presence: a `version` column with conflict rejection and a
   "someone else edited this" banner; presence over Durable Objects or SSE.
2. Real auth: passwordless e-mail or OIDC, `SameSite=Strict` + CSRF, rate limiting, audit log.
3. Version history with a diff/restore view.
4. Attachments via R2 with presigned uploads.
5. PDF export through the print stylesheet.

## 5. Deployment and source hosting

- **App**: Cloudflare Workers (`ajaia-docs`), static assets binding for the SPA, D1 database
  `ajaia` for documents, users, sessions and shares, custom account
  `2b507c00d9b7ba9d7f64d6de1a3ce78e`. Deployed with `npm run deploy`.
- **Source**: this folder is the canonical copy. A public GitHub mirror is included for
  convenience; the live deployment does not depend on it.
- The Cloudflare account is a personal account; the account id and D1 id are pinned in
  `wrangler.jsonc` so `npm run deploy` reproduces the exact deployment.

## 6. Verification summary

- `npm run typecheck` → clean.
- `npm test` → 8/8 (auth, persistence, role matrix, validation) against the real app + SQL.
- Live API checks against the deployed Worker (login, list, patch, share, forbidden paths).
- Playwright end-to-end run of the full flow against the live URL; reload-persistence proof.
- Screenshots reviewed by hand in both appearances — that is how a viewer-mode save bug was
  caught (see [`AI-WORKFLOW.md`](AI-WORKFLOW.md)).
