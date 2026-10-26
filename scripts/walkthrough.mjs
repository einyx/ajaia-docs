/**
 * Records the walkthrough video and captures review screenshots.
 *
 *   node scripts/walkthrough.mjs [baseUrl]
 *
 * Output:
 *   artifacts/video/walkthrough.webm   (raw Playwright capture)
 *   artifacts/video/walkthrough.mp4     (converted for broad playback)
 *   artifacts/screens/*.png
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const base = process.argv[2] ?? 'https://ajaia-docs.alessio-2b5.workers.dev';
const artifacts = resolve(root, 'artifacts');
const videoDir = resolve(artifacts, 'video');
const shotsDir = resolve(artifacts, 'screens');

rmSync(videoDir, { recursive: true, force: true });
mkdirSync(videoDir, { recursive: true });
mkdirSync(shotsDir, { recursive: true });

const markdownFixture = `# Imported Brief

This document was created by **importing a Markdown file** into Ajaia Docs.

## What the import carries over

- Headings, bold and italic
- Bullet and numbered lists
- Links such as [Cloudflare D1](https://developers.cloudflare.com/d1/)
- Block quotes

> Imported files become ordinary, fully editable documents.

1. Rename the document
2. Keep formatting
3. Share it with a teammate
`;

writeFileSync(resolve(artifacts, 'Imported Brief.md'), markdownFixture);

const CAPTION_STYLE = [
  'position:fixed', 'left:50%', 'bottom:26px', 'transform:translateX(-50%)',
  'z-index:9999', 'max-width:78vw', 'padding:10px 18px', 'border-radius:12px',
  'background:rgba(0,0,0,0.82)', 'color:#fff',
  'font:500 15px/1.4 -apple-system,system-ui,sans-serif',
  'text-align:center', 'pointer-events:none', 'box-shadow:0 8px 30px rgba(0,0,0,0.35)',
].join(';');

async function caption(page, text) {
  await page.evaluate(
    ([style, value]) => {
      let el = document.getElementById('walkthrough-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'walkthrough-caption';
        el.style.cssText = style;
        document.body.appendChild(el);
      }
      el.textContent = value;
    },
    [CAPTION_STYLE, text],
  );
  const spoken = NARRATION[text];
  if (spoken) narration.push({ startMs: Date.now() - startedAt, text: spoken });
}

/**
 * Voice-over script. Keyed by the on-screen caption so the two can never drift.
 * `scripts/narrate.mjs` turns these into OpenAI TTS audio and mixes it under the
 * capture using the timeline recorded here.
 */
const NARRATION = {
  'Ajaia Docs — sign in with a seeded account (mocked auth, no passwords)':
    "This is Ajaia Docs, a lightweight collaborative document editor. Sign in is mocked with seeded accounts, so there are no passwords to remember.",
  'Signed in — the document list and content come from Cloudflare D1':
    'Signed in as Alessio. The sidebar separates my documents from documents shared with me, and everything comes from a Cloudflare D1 database.',
  'Documents persist across reloads; formatting is stored as semantic HTML':
    'Documents persist across reloads. Formatting is stored as semantic HTML, so bold, headings and lists survive a refresh.',
  'Inline formatting: bold, italic, underline — with keyboard shortcuts':
    'Inline formatting works from the toolbar or with keyboard shortcuts. I am typing bold, italic and underline now, and each change autosaves.',
  'Text styles live in one Format menu (Apple HIG pattern)':
    "Text styles live behind a single Format menu, which is how Apple's own apps group them.",
  'Bulleted lists, numbered lists, quotes and code blocks':
    'Lists, quotes and code blocks are one click away, and the toolbar always reflects the current block type.',
  'Create a document, rename it, and let autosave do the rest':
    'Creating a document takes one click. I rename it inline, type a line, and autosave persists it to the database.',
  'Persistence proof: reload the page — the content comes back from D1':
    'Here is the proof. I reload the page, and the content comes straight back from D1, because every edit was already saved.',
  'File import: a .md file becomes a new editable document':
    'File import turns a markdown file into a new editable document. Parsing happens in the browser and the result is sanitised before it is stored.',
  'Sharing: invite people and choose editor or viewer access':
    'Sharing is the core of the product. The owner invites a teammate by email and chooses either editor or viewer access.',
  'Switch accounts — shared work shows up under “Shared with me”':
    'Switching accounts shows the sharing model from the other side. Maya now sees the document under Shared with me.',
  'Maya opens the shared document with edit access':
    'Maya opens the shared document. Her role is Can edit, so she can change the content just like the owner.',
  'Viewer access is enforced by the API, not just the UI':
    "Sam's role is Can view. The editor is read-only for him, and the API rejects any write he attempts, so the rule is enforced server-side.",
  'Dark mode follows the system appearance (prefers-color-scheme)':
    "The interface follows Apple's Human Interface Guidelines, including dark mode, which follows the system appearance setting.",
  'Export the document as Markdown from the ⋯ menu':
    'Any document can be exported as Markdown or plain text from this menu.',
  'Live at ajaia-docs.alessio-2b5.workers.dev — source, notes and video in the README':
    'That is the full walkthrough. The app is live on Cloudflare Workers, and the source, architecture notes and AI workflow notes are in the readme.',
};

const wait = (page, ms) => page.waitForTimeout(ms);

/** Narration timeline recorded alongside the capture (timestamps drive the mix). */
const narration = [];
const startedAt = Date.now();

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
  recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: resolve(shotsDir, `${name}.png`) });
  console.log(`shot: ${name}`);
}

// ------------------------------------------------------------- 1. sign in --
await page.goto(base, { waitUntil: 'networkidle' });
await caption(page, 'Ajaia Docs — sign in with a seeded account (mocked auth, no passwords)');
await wait(page, 6000);
await shot('01-signin');

await page.getByText('alessio@linux.com').click();
await page.waitForSelector('.ProseMirror', { timeout: 15000 });
await caption(page, 'Signed in — the document list and content come from Cloudflare D1');
await wait(page, 5000);
await shot('02-editor');

// -------------------------------------------------- 2. read the document --
await caption(page, 'Documents persist across reloads; formatting is stored as semantic HTML');
await page.mouse.move(900, 600);
await page.mouse.wheel(0, 220);
await wait(page, 3500);
await page.mouse.wheel(0, -400);
await wait(page, 2500);

// ---------------------------------------------------------- 3. formatting --
await caption(page, 'Inline formatting: bold, italic, underline — with keyboard shortcuts');
await page.click('.ProseMirror');
await page.keyboard.press('Control+End');
await page.keyboard.type('\n\nFormatted live: ', { delay: 30 });
await page.keyboard.press('Control+b');
await page.keyboard.type('bold', { delay: 45 });
await page.keyboard.press('Control+b');
await page.keyboard.type(', ', { delay: 30 });
await page.keyboard.press('Control+i');
await page.keyboard.type('italic', { delay: 45 });
await page.keyboard.press('Control+i');
await page.keyboard.type(' and ', { delay: 30 });
await page.keyboard.press('Control+u');
await page.keyboard.type('underline', { delay: 45 });
await page.keyboard.press('Control+u');
await page.keyboard.type('.', { delay: 30 });
await wait(page, 2500);
await shot('03-formatting-inline');

// ------------------------------------------------------- 4. format menu --
await caption(page, 'Text styles live in one Format menu (Apple HIG pattern)');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: /Body|Heading/ }).first().click();
await wait(page, 3000);
await shot('04-format-menu');
await page.getByRole('menuitem', { name: 'Heading 2' }).click();
await page.keyboard.type('A heading from the Format menu', { delay: 28 });
await page.keyboard.press('Enter');
await wait(page, 1500);

// --------------------------------------------------------- 5. lists etc. --
await caption(page, 'Bulleted lists, numbered lists, quotes and code blocks');
await page.getByRole('button', { name: 'Bulleted list' }).click();
await page.keyboard.type('First bullet', { delay: 28 });
await page.keyboard.press('Enter');
await page.keyboard.type('Second bullet', { delay: 28 });
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Numbered list' }).click();
await page.keyboard.type('Ship the editor slice', { delay: 28 });
await page.keyboard.press('Enter');
await page.keyboard.type('Defer presence indicators', { delay: 28 });
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Block quote' }).click();
await page.keyboard.type('A block quote, styled like Apple system typography.', { delay: 28 });
await wait(page, 3000);
await shot('05-lists-quote');

// --------------------------------------------------------- 6. new doc ----
await caption(page, 'Create a document, rename it, and let autosave do the rest');
await page.getByRole('button', { name: 'New document' }).click();
await page.waitForTimeout(4000);
await page.getByLabel('Document title').fill('Launch checklist', { delay: 40 });
await page.getByLabel('Document title').press('Enter');
await page.click('.ProseMirror');
await page.keyboard.type('Owner: Alessio.', { delay: 28 });
await page.keyboard.press('Enter');
await page.keyboard.type('Ship the editor slice before presence indicators.', { delay: 28 });
await wait(page, 4000);
await shot('06-new-document');

// ------------------------------------------------- 6b. persistence proof --
await caption(page, 'Persistence proof: reload the page — the content comes back from D1');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.ProseMirror', { timeout: 15000 });
await wait(page, 5000);
await shot('06b-after-reload');
await page.locator('nav li button', { hasText: 'Launch checklist' }).first().click();
await wait(page, 4000);

// ------------------------------------------------------------ 7. import --
await caption(page, 'File import: a .md file becomes a new editable document');
await page.setInputFiles('input[type=file]', resolve(artifacts, 'Imported Brief.md'));
await page.waitForTimeout(6000);
await page.mouse.wheel(0, 260);
await wait(page, 3000);
await shot('07-imported-document');

// ----------------------------------------------------------- 8. sharing --
await caption(page, 'Sharing: invite people and choose editor or viewer access');
await page.getByRole('button', { name: 'Share' }).click();
await page.waitForTimeout(3000);
await shot('08-share-dialog');
await page.getByLabel('Email address').fill('maya@ajaia.dev', { delay: 30 });
await page.getByRole('button', { name: 'Invite' }).click();
await page.waitForTimeout(3000);
await page.getByLabel('Email address').fill('sam@ajaia.dev', { delay: 30 });
await page.locator('form').getByRole('radio', { name: 'Can view' }).click();
await page.getByRole('button', { name: 'Invite' }).click();
await page.waitForTimeout(3000);
await shot('09-share-invited');
await page.getByRole('button', { name: 'Close' }).click();
await wait(page, 2000);

// ------------------------------------------------------- 9. switch user --
await caption(page, 'Switch accounts — shared work shows up under “Shared with me”');
await page.getByRole('button', { name: 'Switch account' }).click();
await page.waitForTimeout(2500);
await page.getByText('maya@ajaia.dev').click();
await page.waitForTimeout(3500);
await shot('10-shared-with-me');

await caption(page, 'Maya opens the shared document with edit access');
await page.locator('nav li button', { hasText: 'Imported Brief' }).first().click();
await page.waitForTimeout(4000);
await shot('11-maya-editing');

// -------------------------------------------------- 10. viewer (read only) --
await caption(page, 'Viewer access is enforced by the API — editing is rejected server-side');
await page.getByRole('button', { name: 'Switch account' }).click();
await page.waitForTimeout(2500);
await page.getByText('sam@ajaia.dev').click();
await page.waitForTimeout(3000);
await page.locator('nav li button', { hasText: 'Imported Brief' }).first().click();
await page.waitForTimeout(4000);
await shot('12-viewer-readonly');

// --------------------------------------------------------- 11. dark mode --
await caption(page, 'Dark mode follows the system appearance (prefers-color-scheme)');
await page.emulateMedia({ colorScheme: 'dark' });
await wait(page, 4000);
await shot('13-dark-mode');
await page.getByRole('button', { name: 'Share' }).click();
await page.waitForTimeout(4000);
await shot('14-dark-share-dialog');
await page.getByRole('button', { name: 'Close' }).click();
await wait(page, 2500);

// ------------------------------------------------------------- 12. export --
await caption(page, 'Export the document as Markdown from the ⋯ menu');
await page.getByRole('button', { name: 'Document menu' }).click();
await wait(page, 3500);
await shot('15-export-menu');
await page.getByRole('menuitem', { name: 'Export as Markdown' }).click();
await wait(page, 3500);

await caption(page, 'Live at ajaia-docs.alessio-2b5.workers.dev — source, notes and video in the README');
await wait(page, 6000);
await shot('16-final');

await page.close();
await context.close();
await browser.close();

const raw = readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
const rawPath = resolve(videoDir, raw[0]);
const mp4Path = resolve(videoDir, 'walkthrough.mp4');

writeFileSync(resolve(artifacts, 'narration.json'), JSON.stringify(narration, null, 2));
console.log(`narration segments: ${narration.length}`);

const ffmpeg = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((bin) => existsSync(bin));
if (ffmpeg) {
  execFileSync(ffmpeg, ['-y', '-i', rawPath, '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path], {
    stdio: 'ignore',
  });
  console.log('video: artifacts/video/walkthrough.mp4');
} else {
  console.warn('no system ffmpeg found — keeping the raw webm capture');
}
console.log('raw video:', rawPath);
