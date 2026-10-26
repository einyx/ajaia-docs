/**
 * Verifies the PDF export end to end.
 *
 *   npm run build && node scripts/verify-pdf-export.mjs [baseUrl]
 *
 * With no baseUrl it starts the standalone server on a throwaway database.
 * Checks that the `⋯` menu opens the print pipeline, that the print
 * stylesheet hides the app chrome and keeps the document (title + body) on
 * white paper, and that the browser's own PDF output contains the document
 * and none of the toolbar.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 8791;
const base = process.argv[2] ?? `http://localhost:${port}`;
const ownServer = !process.argv[2];
const pdfPath = resolve(root, 'artifacts/export-check.pdf');

const failures = [];

function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

let server;
let dbDir;

if (ownServer) {
  dbDir = mkdtempSync(join(tmpdir(), 'ajaia-pdf-'));
  server = spawn(process.execPath, ['--experimental-strip-types', 'src/server/standalone.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), AJAIA_DB: join(dbDir, 'ajaia.db') },
    stdio: 'ignore',
  });

  const up = await (async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const res = await fetch(base);
        if (res.ok) return true;
      } catch {
        /* not up yet */
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    return false;
  })();

  if (!up) {
    console.error(`server did not start on ${base}`);
    server.kill();
    process.exit(1);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: 'light' });

// The real browser print dialog cannot open in headless Chromium, so record
// the call instead — the PDF itself is produced by the same print stylesheet
// further down.
await page.addInitScript(() => {
  window.__printed = 0;
  window.__printedTitle = '';
  window.print = () => {
    window.__printed += 1;
    window.__printedTitle = document.title;
  };
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.getByText('alessio@linux.com').click();
await page.waitForSelector('.ProseMirror', { timeout: 15000 });

const docTitle = (await page.getByLabel('Document title').inputValue()).trim();
check('a document is open', docTitle.length > 0, docTitle);

// ------------------------------------------------------------ the menu --
await page.getByRole('button', { name: 'Document menu' }).click();
const pdfItem = page.getByRole('menuitem', { name: 'Export as PDF' });
await pdfItem.waitFor({ state: 'visible', timeout: 5000 });
check('the ⋯ menu offers "Export as PDF"', true);

await pdfItem.click();
const printed = await page.evaluate(() => ({ calls: window.__printed, title: window.__printedTitle }));
check('the menu item opens the print pipeline', printed.calls === 1, `${printed.calls} call(s)`);
check(
  'the saved file is named after the document',
  printed.title === docTitle,
  `${printed.title || '(empty)'} vs ${docTitle}`,
);
check('the app title is restored after printing', (await page.title()) === 'Ajaia Docs', await page.title());

// -------------------------------------------------- the print stylesheet --
const bodyText = await page.evaluate(() => document.querySelector('.ProseMirror p')?.textContent?.trim() ?? '');

await page.emulateMedia({ media: 'print' });
const printedState = await page.evaluate(() => {
  const shown = (selector) => {
    const el = document.querySelector(selector);
    return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  };
  return {
    sidebar: shown('aside'),
    toolbar: shown('.glass'),
    title: shown('.print-only'),
    titleText: document.querySelector('.print-only')?.textContent?.trim() ?? '',
    color: getComputedStyle(document.querySelector('.ProseMirror')).color,
  };
});

check('the sidebar is not printed', !printedState.sidebar);
check('the toolbar is not printed', !printedState.toolbar);
check('the body is printed in black', printedState.color === 'rgb(0, 0, 0)', printedState.color);
check(
  'the title is printed once, never twice',
  printedState.titleText === '' || printedState.titleText === docTitle,
  printedState.titleText,
);

await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
const darkColor = await page.evaluate(() => getComputedStyle(document.querySelector('.ProseMirror')).color);
check('dark mode does not print white on white', darkColor === 'rgb(0, 0, 0)', darkColor);

await page.emulateMedia({ media: 'print' });

// --------------------------------------------------------- the PDF itself --
await page.pdf({ path: pdfPath, format: 'A4' });
check('the browser produced a PDF', existsSync(pdfPath), pdfPath);

const pdftotext = ['/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext'].find((bin) => existsSync(bin));
if (pdftotext) {
  const text = execFileSync(pdftotext, [pdfPath, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
  const phrase = bodyText.slice(0, 60);
  check('the PDF contains the document text', phrase.length > 0 && text.includes(phrase), phrase);
  const titles = text.split(docTitle).length - 1;
  check('the PDF shows the title once', titles === 1, `${titles} occurrence(s)`);
  check(
    'the PDF contains no toolbar',
    !/Bulleted list|Numbered list|Block quote|Code block|Add link|Clear formatting|Text style|Document menu/.test(text),
  );
} else {
  console.warn('pdftotext not found — skipped the PDF text checks');
}

// A document whose body does not open with the title still gets it printed.
await page.emulateMedia({ media: 'screen' });
await page.getByLabel('Document title').fill('Print check');
await page.emulateMedia({ media: 'print' });
const reprintedTitle = await page.evaluate(() => {
  const el = document.querySelector('.print-only');
  return el && getComputedStyle(el).display !== 'none' ? el.textContent.trim() : '';
});
check('the title is printed when the body does not repeat it', reprintedTitle === 'Print check', reprintedTitle);

await browser.close();
if (server) {
  server.kill();
  rmSync(dbDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nPDF export verified.');
