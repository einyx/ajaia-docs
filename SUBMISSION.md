# SUBMISSION — Ajaia Docs

A lightweight collaborative document editor. Built for a 4–6 hour product-engineering
assignment: one coherent slice of the Google Docs surface, deployed and reviewable.

## 1. Links

| What | Where |
| --- | --- |
| **Live product** | <https://ajaia-docs.alessio-2b5.workers.dev> |
| **Walkthrough video (3–5 min, narrated)** | <https://ajaia-docs.alessio-2b5.workers.dev/walkthrough.mp4> — also at `docs/walkthrough.mp4` in the source folder |
| **Source code (public mirror)** | <https://github.com/einyx/ajaia-docs> |
| Setup & run instructions | [`README.md`](README.md) |
| Architecture note | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI-WORKFLOW.md`](AI-WORKFLOW.md) |
| Video URL (plain text) | `walkthrough-video-url.txt` |
| Screenshots | `docs/screens/` (light and dark, 21 frames) |

### What the video covers

The walkthrough is narrated and structured against the assignment's evaluation criteria, so a
reviewer can find each one quickly:

| Beat | Criterion it answers |
| --- | --- |
| One deliberate slice — and what I chose not to build | Turning an open-ended prompt into a coherent product slice; prioritisation under time pressure |
| Front end, API and database in one screenshot | Full-stack execution across frontend, backend, persistence |
| Formatting stored as semantic HTML; autosave; reload proof | Persistence; editing experience within scope |
| Inline formatting, Format menu, lists, quotes | Quality of the document editing experience |
| File import: a `.md` file becomes a new editable document | Practical handling of file upload |
| Sharing: editor vs viewer access; switch accounts; viewer read-only | Practical handling of sharing; access logic |
| Dark mode / Apple HIG | Product and UI quality |
| Export menu | Scope discipline |
| Source, architecture note and AI workflow note in the repository | Code clarity, written communication, mature use of AI tools |


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
├── src/client/                React SPA: editor, sidebar, share sheet, version history, login
├── src/server/                Hono API, storage adapter, SQL repository, seeding
├── src/shared/                types and constants shared by client and server
├── migrations/                D1 / SQLite schema (0001 init, 0003 version history)
├── scripts/                   dev runner, walkthrough recorder, narration, packaging
├── tests/api.test.ts          vitest suite over the API (17 tests)
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
8. **Version history** → `⋯` → *Version history* → the snapshots of the document, with their
   author, age and a text preview. *Restore* puts an earlier one back (a viewer sees the list
   but no restore button, and the API answers `403 read_only` if one tries anyway).

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
- Version history: content snapshots taken by the server on every meaningful edit (collapsed
  into one per 15-second window, newest 30 kept), listed with author and age, with a
  permission-checked restore.
- Markdown and plain-text export; dark mode; keyboard-accessible dialogs and menus;
  Apple HIG visual language (semantic colours, Apple text styles, Liquid Glass navigation
  layer, 44 pt touch targets, reduced-transparency/motion/contrast fallbacks).

**Incomplete or deliberately absent**
- Auth is mocked: seeded accounts, no passwords, no email verification, no CSRF token, no
  rate limiting, no audit log. The *authorisation* layer is real.
- No real-time collaboration: last-write-wins, so two simultaneous editors can overwrite each
  other. No presence indicators.
- No comments, no attachments, no PDF export, and version history has no character-level diff
  (only a text preview of each snapshot).
- Import is limited to `.md`, `.txt` and `.docx`; `.docx` conversion is best-effort.
- The share picker lists seeded accounts rather than a directory of real users.

**Next 2–4 hours** (full reasoning in [`ARCHITECTURE.md`](ARCHITECTURE.md) §8)
1. Optimistic concurrency + presence: a `version` column with conflict rejection and a
   "someone else edited this" banner; presence over Durable Objects or SSE.
2. Real auth: passwordless e-mail or OIDC, `SameSite=Strict` + CSRF, rate limiting, audit log.
3. Version history, second half: a character-level diff against the current text, and named
   versions on top of the automatic ones.
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
- `npm test` → 22/22 (auth, persistence, role matrix, validation, version history) against the real app + SQL.
- Live API checks against the deployed Worker (login, list, patch, share, forbidden paths).
- Playwright end-to-end run of the full flow against the live URL; reload-persistence proof.
- Screenshots reviewed by hand in both appearances — that is how a viewer-mode save bug was
  caught (see [`AI-WORKFLOW.md`](AI-WORKFLOW.md)).
