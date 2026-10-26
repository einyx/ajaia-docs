import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
await p.goto('file:///Users/alessio/code/aja/artifacts/warm-mockup.html');
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/ref/full.png', fullPage: true });
await b.close();
