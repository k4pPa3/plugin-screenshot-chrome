const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { timestampFixture } = require('../verify-fixture.cjs');

test('verification page checks real files, invalidates stale results and works on mobile and dark mode', { timeout: 60000 }, async () => {
  const fixture = await timestampFixture();
  const root = path.resolve(__dirname, '../..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fwc-verify-browser-'));
  let browser;
  try {
    browser = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      args: ['--no-sandbox', '--lang=en-US', `--disable-extensions-except=${root}`, `--load-extension=${root}`] });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const workerUrl = new URL(worker.url());
    const origin = `${workerUrl.protocol}//${workerUrl.host}`;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(`${origin}/popup.html`);
    const newTab = browser.waitForEvent('page');
    await page.locator('#openVerify').click();
    const verify = await newTab;
    verify.on('pageerror', err => errors.push(err.message));
    await verify.waitForSelector('#inputs:not([disabled])');
    const external = [];
    await verify.route(/^https?:/, route => { external.push(route.request().url()); return route.abort(); });
    const upload = (id, name, buffer) => verify.locator(id).setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(buffer) });
    await upload('#evidenceFile', fixture.filename, fixture.fileBytes);
    await upload('#manifestFile', 'capture_test.manifest.sha256', fixture.manifestBytes);
    await upload('#tokenFile', 'capture_test.tsr', fixture.tsr);
    await verify.locator('summary').click();
    await verify.locator('#caPem').fill(fixture.caPem);
    await verify.locator('button[type=submit]').click();
    await verify.waitForSelector('#result.verified:not([hidden])');
    assert.match(await verify.locator('#result').innerText(), /Verification Test TSA/);
    await verify.locator('#caPem').fill('');
    assert.equal(await verify.locator('#result').isVisible(), false);
    await verify.locator('button[type=submit]').click();
    await verify.waitForSelector('#result.untrusted:not([hidden])');
    await upload('#evidenceFile', fixture.filename, Buffer.from('changed evidence'));
    await verify.locator('button[type=submit]').click();
    await verify.waitForSelector('#status.error');
    assert.match(await verify.locator('#status').innerText(), /does not match/);
    assert.equal(await verify.locator('#result').isVisible(), false);
    await upload('#evidenceFile', 'capture.zip', Buffer.from('zip'));
    await verify.locator('button[type=submit]').click();
    await verify.waitForFunction(() => document.getElementById('status').textContent.startsWith('Extract the ZIP'));
    await verify.emulateMedia({ colorScheme: 'dark' });
    await verify.setViewportSize({ width: 360, height: 800 });
    assert.equal(await verify.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await verify.locator('#evidenceFile').focus();
    assert.equal(await verify.locator('#evidenceFile').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
});
