/**
 * Renders the Mermaid diagrams in ARCHITECTURE.md to static SVG/PNG assets,
 * so the architecture reads the same in a markdown viewer, on GitHub, or in
 * the submission bundle.
 *
 *   node scripts/render-diagram.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const docsDir = resolve(root, 'docs');
mkdirSync(docsDir, { recursive: true });

const markdown = readFileSync(resolve(root, 'ARCHITECTURE.md'), 'utf8');
const diagrams = [...markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((match) => match[1]);
if (!diagrams.length) {
  console.error('No mermaid diagrams found in ARCHITECTURE.md');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });

for (const [index, diagram] of diagrams.entries()) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>
      body { margin: 0; padding: 28px; background: #ffffff; font-family: -apple-system, system-ui, sans-serif; }
      #diagram { display: inline-block; }
    </style></head>
    <body><div id="diagram"></div>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: '-apple-system, system-ui, sans-serif',
          primaryColor: '#eef2ff',
          primaryBorderColor: '#a5b4fc',
          primaryTextColor: '#18181b',
          secondaryColor: '#f4f4f5',
          tertiaryColor: '#fafafa',
          lineColor: '#71717a',
          clusterBkg: '#fafafa',
          clusterBorder: '#e4e4e7',
        },
      });
      const { svg } = await mermaid.render('m${index}', ${JSON.stringify(diagram)});
      document.getElementById('diagram').innerHTML = svg;
      document.body.dataset.ready = '1';
    </script></body></html>`;

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.waitForTimeout(800);

  const element = await page.$('#diagram svg');
  const name = index === 0 ? 'architecture' : `architecture-${index + 1}`;
  const svg = await element.evaluate((node) => new XMLSerializer().serializeToString(node));
  writeFileSync(resolve(docsDir, `${name}.svg`), svg);
  await element.screenshot({ path: resolve(docsDir, `${name}.png`) });
  console.log(`rendered: docs/${name}.svg + .png`);
}

await browser.close();
