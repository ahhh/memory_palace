/**
 * Regenerate every fixture palace and decode every fixture link in Chromium, Firefox and
 * WebKit (Safari's engine), checking hashes against the Node-recorded fixtures. Shared
 * links must rebuild bit-identically in every browser.
 *
 *   npx playwright-core install chromium firefox webkit   # once
 *   npm run test:engines
 */
import { createServer } from 'vite';
import { chromium, firefox, webkit } from 'playwright-core';

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = `${server.resolvedUrls.local[0]}tools/determinism.html`;
let failed = false;
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  let browser;
  try {
    browser = await engine.launch();
  } catch (e) {
    console.error(`✗ ${name}: could not launch (${String(e).split('\n')[0]})`);
    failed = true;
    continue;
  }
  const page = await browser.newPage();
  await page.goto(url);
  const res = await page.waitForFunction(() => window.__result, null, { timeout: 120000 }).then((h) => h.jsonValue());
  if (res.bad.length) {
    failed = true;
    console.error(`✗ ${name}: ${res.bad.length}/${res.checked} mismatches\n  ${res.bad.slice(0, 10).join('\n  ')}`);
  } else console.log(`✓ ${name}: ${res.checked} palaces and links identical`);
  await browser.close();
}
await server.close();
process.exit(failed ? 1 : 0);
