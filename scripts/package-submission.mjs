/**
 * Builds the review bundle: copies the docs, screenshots and video into
 * submission/ and zips it.
 *
 *   node scripts/package-submission.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'submission');
const video = resolve(root, 'artifacts/video/walkthrough-narrated.mp4');
const liveVideo = resolve(root, 'artifacts/video/walkthrough.mp4');
const source = existsSync(video) ? video : liveVideo;

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'docs/screens'), { recursive: true });

for (const file of ['README.md', 'ARCHITECTURE.md', 'AI-WORKFLOW.md', 'SUBMISSION.md', 'walkthrough-video-url.txt']) {
  const path = resolve(root, file);
  if (existsSync(path)) cpSync(path, resolve(out, file));
}

const screens = resolve(root, 'artifacts/screens');
if (existsSync(screens)) {
  for (const file of readdirSync(screens)) {
    if (file.endsWith('.png')) cpSync(resolve(screens, file), resolve(out, 'docs/screens', file));
  }
}

if (existsSync(source)) cpSync(source, resolve(out, 'docs/walkthrough.mp4'));

// Source code (no node_modules, no build output, no local database).
const codeOut = resolve(out, 'source');
mkdirSync(codeOut, { recursive: true });
const include = ['src', 'scripts', 'tests', 'migrations', 'public', 'docs'];
for (const dir of include) {
  const path = resolve(root, dir);
  if (existsSync(path)) cpSync(path, resolve(codeOut, dir), { recursive: true });
}
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'wrangler.jsonc', '.gitignore']) {
  const path = resolve(root, file);
  if (existsSync(path)) cpSync(path, resolve(codeOut, file));
}

const zipPath = resolve(root, 'ajaia-docs-submission.zip');
rmSync(zipPath, { force: true });
execFileSync('zip', ['-rq', zipPath, 'submission'], { cwd: root });

const size = (statSync(zipPath).size / (1024 * 1024)).toFixed(1);
console.log(`submission bundle: ${zipPath} (${size} MB)`);
