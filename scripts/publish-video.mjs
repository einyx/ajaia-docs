/**
 * Publishes the walkthrough video as a static asset, so the deployed Worker
 * serves it at /walkthrough.mp4 — the URL the submission points reviewers at.
 *
 *   node scripts/publish-video.mjs
 *
 * Runs before every build (see the `build` script in package.json).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Newest first: the narrated render wins over the raw capture.
const candidates = [
  'docs/walkthrough.mp4',
  'artifacts/video/walkthrough-narrated.mp4',
  'artifacts/video/walkthrough.mp4',
];

const source = candidates.map((path) => resolve(root, path)).find((path) => existsSync(path));

if (!source) {
  console.warn(`[publish-video] no walkthrough video found — looked for: ${candidates.join(', ')}`);
  process.exit(0);
}

const target = resolve(root, 'public/walkthrough.mp4');
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`[publish-video] ${source.replace(`${root}/`, '')} -> public/walkthrough.mp4`);
