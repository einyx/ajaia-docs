# AI workflow note

Short, specific, and honest about what the AI did and what I did with it.

## Tools used

| Tool | Used for |
| --- | --- |
| **Coding agent (OpenCode + Claude Code skills)** | Writing the application, the test suite, the deployment scripts and these documents |
| **Playwright** | End-to-end verification of the real flow, screenshots, and recording the walkthrough video |
| **OpenAI TTS (`gpt-4o-mini-tts`, voice `onyx`)** | The voice-over in the walkthrough video, with delivery instructions ("warm, confident product-engineer narration") |
| **Cloudflare MCP + `wrangler` CLI** | D1 database, migrations, deployment, custom-domain work during exploration |
| **Browser MCP** | Interactive QA against the running app (sign-in, editor, share sheet, account switch) |
| **`ffmpeg`** | Video conversion (WebM → MP4) and mixing the narration onto the timeline |

Skills that shaped the work: `brainstorming` (scope framing), `design-taste-frontend` (design
read, colour/typography discipline, pre-flight checks) and Apple's HIG + "Adopting Liquid Glass"
documentation for the interface layer.

## Where AI materially sped things up

- **Boilerplate that is boring but slow to type correctly**: the Hono route tree, the D1/SQLite
  storage adapter, TipTap wiring, the React component shells, Tailwind v4 theme tokens.
- **The HIG token layer.** Translating Apple's semantic palette, text styles and material
  behaviour into CSS custom properties plus a Tailwind v4 `@theme inline` block was produced in
  one pass and then tuned by hand.
- **The walkthrough script**: a 200-line Playwright script that drives the real app, records
  screenshots and captures a narration timeline — this is what made the video reproducible
  instead of a one-off manual recording.
- **Documentation**: README, architecture note and this file were drafted from the code that
  actually exists, then edited against the running product.
- **Debugging the deployment path**: the AI worked through Cloudflare's multipart upload API,
  custom-domain provisioning and DNS propagation instead of me hand-holding each step.
- **Version history** (the bonus slice added afterwards): the schema, the snapshot rule and
  the panel were drafted in one pass; I changed the *policy* rather than the code — the first
  draft snapshotted on every autosave, which would have produced a history of keystrokes
  instead of checkpoints, so edits inside a 15-second window now collapse into one version.

## What I changed or rejected

These are the places where the AI's first answer was wrong or where I deliberately went
another way:

| AI output | What I did |
| --- | --- |
| First deployment went to the **meshx org Cloudflare account** (the only one my tooling was authenticated to) | Stopped and asked; moved to the personal `alessio@linux.com` account, and **deleted every artefact I had created in meshx** (Worker, D1 database, DNS record, route) |
| "Next.js + Postgres" default stack | Rejected — Workers + D1 removes a whole service, and the `Db` interface keeps the option open |
| Hand-rolled SVG icons in the toolbar and menus | Rejected — switched to one icon family (`@phosphor-icons/react`), consistent weight, per the design rule "never hand-roll icons" |
| Uppercase, wide-tracked section labels (`MY DOCUMENTS`) | Rejected as Google-Docs grammar, not Apple's — replaced with 13 px semibold secondary labels |
| First walkthrough video (36 s), second (101 s) | Both rejected as too short for a 3–5 minute brief; re-paced the script with explicit beats, a reload-persistence proof and an export demo |
| Walkthrough script that opened a doc for an account that had none | Crashed the run — rewritten so a viewer account is actually granted access first |
| **Latent bug in my own editor code**: TipTap v3's `setEditable()` emits an `update` event by default, so opening any document as a viewer fired a save that the API rejected (visible as a red "Save failed" in a dark-mode screenshot) | Traced it to the library, not the symptom: fixed with `setEditable(readOnly, false)` and a second guard in the client that never writes for a viewer role |
| Suggestion to add an activity feed / notification centre | Rejected — scope, not value; the brief rewards depth in one slice |
| Imported file content passed to the API without sanitisation | Added DOMPurify before any imported HTML reaches the editor or the API |
| Light-only palette | Rejected — Apple idiom implies both appearances; added a full dark mode driven by `prefers-color-scheme` |

The most useful catch was the **"Save failed" in a screenshot**. The scripted flow still
"passed"; reading the actual rendered image showed a rejected write that should never have
happened. That is the kind of defect that a green test suite does not catch.

## How I verified correctness, UX and reliability

**Correctness**
- `npm run typecheck` — clean (strict TypeScript, no `any` escape hatches in app code).
- `npm test` — 8 vitest tests over the real Hono app and the real SQL, against an in-memory
  database: auth, persistence round-trip, the full role matrix (owner / editor / viewer /
  non-sharee), and request validation.
- Live API checks with `curl` against the deployed Worker — login, list, patch, share, and the
  forbidden paths, each asserted with its status code.

**UX / correctness of the running product**
- Browser-driven QA (browser MCP + Playwright) through the real flow: sign-in → edit → autosave
  → import → share → account switch → viewer role.
- A **reload proof** in the middle of the walkthrough: page reload, content returns from D1.
- I reviewed the rendered screenshots myself (light and dark) rather than trusting that the
  script ran — that is how the viewer "Save failed" and a few layout issues were found.

**Reliability**
- The app is deployed and exercised against the live URL, not just localhost.
- `wrangler deploy` is a single command from a clean checkout (`npm install` → migrate →
  deploy); the D1 id and account id are pinned in `wrangler.jsonc`.
- Autosave has an explicit failure state, and pending edits are flushed on tab hide and on
  document switch, so a refresh does not lose work.

## Honest caveats

- Most of the code was AI-written; my contribution was scoping, the design decisions, the
  verification passes above, and the corrections in the table.
- The walkthrough voice-over is generated by OpenAI TTS from a script I wrote; the on-screen
  captions come from the same script (`scripts/narration-script.mjs`), so the two cannot drift
  apart. The capture is paced to the length of the synthesised audio, which is why the video
  lands inside the requested 3–5 minutes.
- The OpenAI API key used for the voice-over was supplied for this task and is **not** in the
  repository — `scripts/narrate.mjs` reads it from `OPENAI_API_KEY`.
- The narration is deliberately written against the assignment's evaluation criteria: it names
  the scope decision, the access model, the deployment path and the AI-workflow note, so a
  reviewer can map each criterion to a moment in the video.
