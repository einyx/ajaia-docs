/**
 * The walkthrough script — one source of truth for the on-screen captions and
 * the voice-over. `scripts/narrate.mjs` synthesises the audio from `text`,
 * `scripts/walkthrough.mjs` shows `caption` and paces the capture to the
 * synthesised audio length.
 *
 * The beats are ordered to answer the assignment's evaluation criteria:
 * product slice, full-stack execution, editing quality, upload + sharing,
 * deployment, code and written communication, prioritisation, AI practice.
 */
export const BEATS = [
  {
    id: 'slice',
    caption: 'One deliberate slice — and what I chose not to build',
    text: 'The brief was open-ended, so the first decision was what not to build. I picked a single slice and took it all the way through: a document editor with real persistence, real access control, a real file import path, and a live deployment. Real time collaboration, comments and version history are deliberately out of scope, and the architecture note explains why.',
  },
  {
    id: 'signin',
    caption: 'Sign in with a seeded account (mocked auth, no passwords)',
    text: 'Signing in is mocked on purpose, with seeded accounts, so there are no passwords to remember and reviewers can go straight to the product. The authorisation layer underneath it is real.',
  },
  {
    id: 'stack',
    caption: 'Front end, API and database in one screenshot',
    text: 'This is the whole stack. A React and TipTap front end, a Hono API running on Cloudflare Workers, and a D1 database behind it. The same SQL runs locally against SQLite and in production against D1, so the code I tested is the code that shipped.',
  },
  {
    id: 'persistence',
    caption: 'Formatting is stored as semantic HTML, so documents survive reloads',
    text: 'Content is stored as semantic HTML rather than editor internals. A document therefore survives a reload, a schema change, and a reviewer who never opens the app. Autosave flushes seven hundred milliseconds after you stop typing, and again when the tab is hidden.',
  },
  {
    id: 'inline',
    caption: 'Inline formatting: bold, italic, underline — with keyboard shortcuts',
    text: 'The editing experience is where depth mattered most. Bold, italic, underline, headings, lists, quotes, code blocks and links, with keyboard shortcuts throughout, in a toolbar that follows Apple Human Interface Guidelines.',
  },
  {
    id: 'format-menu',
    caption: 'Text styles live in one Format menu (Apple HIG pattern)',
    text: 'Text styles sit behind a single Format menu rather than three separate buttons, which is how Apple groups them, and the toolbar always reflects the current block type.',
  },
  {
    id: 'blocks',
    caption: 'Bulleted lists, numbered lists, quotes and code blocks',
    text: 'Lists, quotes and code blocks are one click away, and every change is persisted immediately, so nothing is ever lost to a refresh.',
  },
  {
    id: 'history',
    caption: 'Version history: every edit is snapshotted, restore in one click',
    text: 'One stretch goal made it in. Each edit is snapshotted, so the document keeps a short history showing what changed, when, and who changed it. Restoring a version is one click, and only the owner or an editor can do it.',
  },
  {
    id: 'new-doc',
    caption: 'Create a document, rename it inline, and watch autosave do the rest',
    text: 'Creating a document takes one click, renaming is inline, and the save state is always visible. Small details like these are what separate a tool that feels finished from one that merely works.',
  },
  {
    id: 'reload',
    caption: 'Persistence proof: reload the page — the content comes back from D1',
    text: 'Here is the persistence proof. I reload the page, and the content comes straight back from D1, because every keystroke was already saved.',
  },
  {
    id: 'import',
    caption: 'File import: a .md file becomes a new editable document',
    text: 'For file upload I chose import over attachment, because it lands the user directly in an editable document. Markdown, plain text and Word files are parsed in the browser, sanitised, and stored as an ordinary document you can keep editing.',
  },
  {
    id: 'share',
    caption: 'Sharing: invite people and choose editor or viewer access',
    text: 'Sharing is the core of the product, so the model is explicit. One owner, and shared users who are either editors or viewers. The owner invites by email and can change or revoke access at any time.',
  },
  {
    id: 'shared',
    caption: 'Switch accounts — shared work shows up under “Shared with me”',
    text: 'From the other side, Maya now sees the document under Shared with me, with her role shown on the row.',
  },
  {
    id: 'maya',
    caption: 'Maya opens the shared document with edit access',
    text: 'Maya has edit access, so she can change the content. The permission is not a disabled button in the interface: the API checks the role on every single request.',
  },
  {
    id: 'viewer',
    caption: 'Viewer access is enforced by the API, not just the UI',
    text: "Sam's role is Can view. The editor is read-only for him, and if he tried to write, the API would reject it. The automated test suite asserts that entire permission matrix, owner, editor, viewer and non sharee.",
  },
  {
    id: 'design',
    caption: 'Dark mode follows the system appearance (prefers-color-scheme)',
    text: 'The interface follows Apple Human Interface Guidelines throughout, including dark mode, which follows the system appearance, and it collapses the glass effects back to solid surfaces when the system asks for reduced transparency.',
  },
  {
    id: 'export',
    caption: 'Export as PDF, Markdown or plain text from the document menu',
    text: 'Export is in this menu, as PDF through the browser print stylesheet, or as Markdown or plain text. The features I chose not to build, attachments and a character-level diff, are listed in the architecture note along with the order I would build them in.',
  },
  {
    id: 'repo',
    caption: 'Source, architecture note and AI workflow note in the repository',
    text: 'The source, the architecture note and the AI workflow note are all in the repository, and I am showing them here. The architecture note explains what I prioritised and the trade-offs I would defend. The AI workflow note lists the tools, what the AI genuinely sped up, and the generated output I rejected.',
  },
  {
    id: 'close',
    caption: 'A coherent slice, shipped and testable in one command',
    text: 'That is the slice: a document editor that persists, shares and imports, deployed and reviewable in one command. The live URL, the video and all the notes are in the submission. Thank you.',
  },
];

export const BEAT_BY_ID = new Map(BEATS.map((beat) => [beat.id, beat]));
