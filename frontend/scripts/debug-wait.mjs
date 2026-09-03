/**
 * debug-wait.js — Temporary diagnostic: reproduce the ai-analysis wait and log
 * the actual error thrown by page.waitForFunction (the E2E catches swallow it).
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const CASE_ID = process.argv[2] || '6a9866ae340dba39bdda61a7';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160));
});
page.on('requestfailed', (r) => console.log('  [requestfailed]', r.url().slice(0, 120)));

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.locator('input[type="email"]').first().fill('test@lawgpt.local');
await page.locator('input[type="password"]').first().fill('Password@123');
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(/\/app/, { timeout: 15000 });
console.log('logged in, url =', page.url());

await page.goto(`${BASE_URL}/app/case/${CASE_ID}/ai-analysis`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const genBtn = page.locator('button').filter({ hasText: /Generate|Regenerate/ }).first();
console.log('generate button visible?', await genBtn.isVisible());
if (await genBtn.isVisible()) {
  await genBtn.click();
  console.log('clicked generate');
}

// Poll body text every 2s for diagnostics
const t0 = Date.now();
let t = '';
while (Date.now() - t0 < 30000) {
  await page.waitForTimeout(2000);
  try {
    t = await page.textContent('body');
  } catch (e) {
    console.log('  textContent error:', e.message.slice(0, 200));
    t = '';
  }
  console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] url=${page.url().slice(0, 60)} text=${t.slice(0, 120).replace(/\s+/g, ' ')}`);

  // Attempt the same waitForFunction the E2E uses, catching and logging errors.
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        if (text.includes('Case summary') && text.includes('Document timeline') && text.includes('Applicable laws')) return 'completed';
        if (text.includes('Analysis failed')) return 'failed';
        return false;
      },
      { timeout: 5000 }
    );
    console.log('  waitForFunction resolved OK');
    break;
  } catch (e) {
    if (e.message && e.message.startsWith('Timeout')) {
      // expected, keep polling
    } else {
      console.log('  waitForFunction ERROR:', e.message.slice(0, 300));
      break;
    }
  }
}

await browser.close();
console.log('done');