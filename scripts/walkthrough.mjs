/**
 * Records the walkthrough video and captures review screenshots.
 *
 *   node scripts/walkthrough.mjs [baseUrl]
 *
 * Output:
 *   artifacts/video/walkthrough.webm   (raw Playwright capture)
 *   artifacts/video/walkthrough.mp4     (converted for broad playback)
 *   artifacts/narration.json            (timeline of each spoken beat)
 *   artifacts/screens/*.png
 *
 * Run `node scripts/narrate.mjs --prepare` first: the capture is paced to the
 * length of the synthesised voice-over, so narration never overlaps itself.
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BEAT_BY_ID } from './narration-script.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const base = process.argv[2] ?? 'https://ajaia-docs.alessio-2b5.workers.dev';
const repo = process.env.GITHUB_REPO ?? 'https://github.com/einyx/ajaia-docs';
const artifacts = resolve(root, 'artifacts');
const videoDir = resolve(artifacts, 'video');
const shotsDir = resolve(artifacts, 'screens');

// Clear previous recordings but keep the synthesised voice-over clips.
for (const file of existsSync(videoDir) ? readdirSync(videoDir) : []) {
  if (file.endsWith('.webm') || file.endsWith('.mp4')) rmSync(resolve(videoDir, file), { force: true });
}
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

// Voice-over length per beat, produced by scripts/narrate.mjs --prepare.
const durationsPath = resolve(artifacts, 'narration-durations.json');
const durations = existsSync(durationsPath)
  ? JSON.parse(readFileSync(durationsPath, 'utf8'))
  : {};
const durationFor = (id) => durations[id] ?? 7000;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
  recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

const narration = [];
const startedAt = Date.now();
let beatStartedAt = 0;
let beatLength = 0;

/** Show the caption for a beat and record when its voice-over starts. */
async function speak(page, id) {
  const beat = BEAT_BY_ID.get(id);
  if (!beat) throw new Error(`Unknown beat: ${id}`);
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
    [CAPTION_STYLE, beat.caption],
  );
  narration.push({ id, startMs: Date.now() - startedAt, text: beat.text });
  beatStartedAt = Date.now();
  beatLength = durationFor(id);
}

/** Wait out the rest of the current beat's voice-over. */
async function settle(page, extraMs = 400) {
  const remaining = beatStartedAt + beatLength + extraMs - Date.now();
  if (remaining > 0) await page.waitForTimeout(remaining);
}

const wait = (page, ms) => page.waitForTimeout(ms);

async function shot(name) {
  await page.screenshot({ path: resolve(shotsDir, `${name}.png`) });
  console.log(`shot: ${name}`);
}

// ------------------------------------------------------------- 1. scope --
await page.goto(base, { waitUntil: 'networkidle' });
await speak(page, 'slice');
await wait(page, 2500);
await shot('01-signin');
await settle(page, 800);

// ------------------------------------------------------------ 2. sign in --
await speak(page, 'signin');
await page.getByText('alessio@linux.com').click();
await page.waitForSelector('.ProseMirror', { timeout: 15000 });
await settle(page, 800);
await shot('02-editor');

// ---------------------------------------------------------- 3. the stack --
await speak(page, 'stack');
await page.mouse.move(820, 700);
await page.mouse.wheel(0, 180);
await settle(page, 600);
await shot('03-stack');

// -------------------------------------------------------- 4. persistence --
await speak(page, 'persistence');
await page.mouse.wheel(0, -300);
await settle(page, 600);

// -------------------------------------------------------- 5. formatting --
await speak(page, 'inline');
await page.click('.ProseMirror');
await page.keyboard.press('Control+End');
await page.keyboard.type('\n\nFormatted live: ', { delay: 28 });
await page.keyboard.press('Control+b');
await page.keyboard.type('bold', { delay: 40 });
await page.keyboard.press('Control+b');
await page.keyboard.type(', ', { delay: 28 });
await page.keyboard.press('Control+i');
await page.keyboard.type('italic', { delay: 40 });
await page.keyboard.press('Control+i');
await page.keyboard.type(' and ', { delay: 28 });
await page.keyboard.press('Control+u');
await page.keyboard.type('underline', { delay: 40 });
await page.keyboard.press('Control+u');
await page.keyboard.type('.', { delay: 28 });
await settle(page, 600);
await shot('04-formatting-inline');

// -------------------------------------------------------- 6. format menu --
await speak(page, 'format-menu');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: /Body|Heading/ }).first().click();
await wait(page, 1800);
await shot('05-format-menu');
await page.getByRole('menuitem', { name: 'Heading 2' }).click();
await page.keyboard.type('A heading from the Format menu', { delay: 26 });
await page.keyboard.press('Enter');
await settle(page, 400);

// ------------------------------------------------------------- 7. blocks --
await speak(page, 'blocks');
await page.getByRole('button', { name: 'Bulleted list' }).click();
await page.keyboard.type('First bullet', { delay: 26 });
await page.keyboard.press('Enter');
await page.keyboard.type('Second bullet', { delay: 26 });
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Numbered list' }).click();
await page.keyboard.type('Ship the editor slice', { delay: 26 });
await page.keyboard.press('Enter');
await page.keyboard.type('Defer presence indicators', { delay: 26 });
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Block quote' }).click();
await page.keyboard.type('A block quote, styled like Apple system typography.', { delay: 26 });
await settle(page, 600);
await shot('06-lists-quote');

// ------------------------------------------------------------- 8. new doc --
await speak(page, 'new-doc');
await page.getByRole('button', { name: 'New document' }).click();
await page.waitForTimeout(2500);
await page.getByLabel('Document title').fill('Launch checklist', { delay: 35 });
await page.getByLabel('Document title').press('Enter');
await page.click('.ProseMirror');
await page.keyboard.type('Owner: Alessio.', { delay: 26 });
await page.keyboard.press('Enter');
await page.keyboard.type('Ship the editor slice before presence indicators.', { delay: 26 });
await settle(page, 600);
await shot('07-new-document');

// ---------------------------------------------------------- 9. reload ----
await speak(page, 'reload');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.ProseMirror', { timeout: 15000 });
await wait(page, 2500);
await shot('08-after-reload');
await page.locator('nav li button', { hasText: 'Launch checklist' }).first().click();
await settle(page, 400);

// ------------------------------------------------------------ 10. import --
await speak(page, 'import');
await page.setInputFiles('input[type=file]', resolve(artifacts, 'Imported Brief.md'));
await page.waitForTimeout(3000);
await page.mouse.wheel(0, 240);
await settle(page, 600);
await shot('09-imported-document');

// ------------------------------------------------------------ 11. share --
await speak(page, 'share');
await page.getByRole('button', { name: 'Share' }).click();
await page.waitForTimeout(1800);
await shot('10-share-dialog');
await page.getByLabel('Email address').fill('maya@ajaia.dev', { delay: 28 });
await page.getByRole('button', { name: 'Invite' }).click();
await page.waitForTimeout(2000);
await page.getByLabel('Email address').fill('sam@ajaia.dev', { delay: 28 });
await page.locator('form').getByRole('radio', { name: 'Can view' }).click();
await page.getByRole('button', { name: 'Invite' }).click();
await wait(page, 2000);
await shot('11-share-invited');
await page.getByRole('button', { name: 'Close' }).click();
await settle(page, 400);

// ---------------------------------------------------------- 12. switch ----
await speak(page, 'shared');
await page.getByRole('button', { name: 'Switch account' }).click();
await page.waitForTimeout(1800);
await page.getByText('maya@ajaia.dev').click();
await page.waitForTimeout(2500);
await shot('12-shared-with-me');

// ------------------------------------------------------------- 13. maya --
await speak(page, 'maya');
await page.locator('nav li button', { hasText: 'Imported Brief' }).first().click();
await wait(page, 2200);
await shot('13-maya-editing');

// ------------------------------------------------------------ 14. viewer --
await speak(page, 'viewer');
await page.getByRole('button', { name: 'Switch account' }).click();
await page.waitForTimeout(1800);
await page.getByText('sam@ajaia.dev').click();
await page.waitForTimeout(2200);
await page.locator('nav li button', { hasText: 'Imported Brief' }).first().click();
await wait(page, 2500);
await shot('14-viewer-readonly');

// ------------------------------------------------------------ 15. design --
await speak(page, 'design');
await page.emulateMedia({ colorScheme: 'dark' });
await wait(page, 2500);
await shot('15-dark-mode');
await page.getByRole('button', { name: 'Share' }).click();
await wait(page, 1800);
await shot('16-dark-share-dialog');
await page.getByRole('button', { name: 'Close' }).click();
await page.emulateMedia({ colorScheme: 'light' });
await wait(page, 1200);

// ------------------------------------------------------------ 16. export --
await speak(page, 'export');
await page.getByRole('button', { name: 'Document menu' }).click();
await wait(page, 2000);
await shot('17-export-menu');
await page.getByRole('menuitem', { name: 'Export as Markdown' }).click();
await settle(page, 400);

// ------------------------------------------------------ 17. repo + docs --
await speak(page, 'repo');
await page.goto(repo, { waitUntil: 'networkidle' });
await wait(page, 3000);
await shot('18-repository');
await page.goto(`${repo}/blob/main/ARCHITECTURE.md`, { waitUntil: 'networkidle' });
await wait(page, 3000);
await shot('19-architecture-note');
await page.goto(`${repo}/blob/main/AI-WORKFLOW.md`, { waitUntil: 'networkidle' });
await wait(page, 2500);
await shot('20-ai-workflow-note');
await settle(page, 400);

// ------------------------------------------------------------- 18. close --
await speak(page, 'close');
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const signIn = page.getByText('alessio@linux.com');
if (await signIn.count()) {
  await signIn.first().click();
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
}
await wait(page, 2500);
await settle(page, 800);
await shot('21-final');

await page.close();
await context.close();
await browser.close();

const raw = readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
const rawPath = resolve(videoDir, raw[0]);
const mp4Path = resolve(videoDir, 'walkthrough.mp4');

writeFileSync(resolve(artifacts, 'narration.json'), JSON.stringify(narration, null, 2));
console.log(`narration beats: ${narration.length}`);

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
