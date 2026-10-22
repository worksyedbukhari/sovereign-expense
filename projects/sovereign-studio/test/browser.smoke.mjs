import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = {'.html':'text/html', '.css':'text/css', '.mjs':'text/javascript', '.svg':'image/svg+xml'};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403); res.end(); return;
    }
    const extension = file.slice(file.lastIndexOf('.'));
    const bytes = await readFile(file);
    res.writeHead(200, {'Content-Type': mime[extension] || 'application/octet-stream'});
    res.end(bytes);
  } catch (error) {
    res.writeHead(404); res.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
try {
  await page.goto(address, {waitUntil:'networkidle'});
  assert.match(await page.title(), /Sovereign Studio/);
  assert.equal(await page.locator('#total-display').textContent(), '$796.00');
  assert.equal(await page.locator('.participant-row').count(), 3);
  assert.equal(await page.locator('.transfer').count(), 2);
  await page.locator('[data-preset="apartment"]').click();
  assert.match(await page.locator('#total-display').textContent(), /3,010\.00/);

  await page.locator('#add-person').click();
  assert.equal(await page.locator('.participant-row').count(), 4);
  const firstPaid = page.locator('.amount-field input').first();
  await firstPaid.fill('0.001');
  assert.match(await page.locator('#form-error').textContent(), /two decimal places/);
  assert.equal(await page.locator('#export-csv').isDisabled(), true);

  await firstPaid.fill('2000.10');
  assert.equal(await page.locator('#form-error').textContent(), '');
  assert.equal(await page.locator('#export-csv').isEnabled(), true);

  const pending = page.waitForEvent('download');
  await page.locator('#export-csv').click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), 'sovereign-studio-settlements.csv');

  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(root,'preview-mobile.png'),fullPage:true});
  const width = await page.evaluate(() => ({
    documentWidth:document.documentElement.scrollWidth,viewport:innerWidth
  }));
  assert.ok(width.documentWidth <= width.viewport + 2,
    'Mobile layout unexpectedly overflows horizontally: ' + JSON.stringify(width));
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:join(root,'preview-desktop.png'),fullPage:true});
  assert.deepEqual(pageErrors, [], 'No uncaught browser errors');

  console.log('Sovereign Studio browser smoke PASS: interactions, CSV, responsive rendering.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
