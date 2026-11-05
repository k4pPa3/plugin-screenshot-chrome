// Uses only a local HTTP fixture; no external pages or TSA services.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createHash } = require('node:crypto');

test('real extension: redirect, scroll traffic, completed and interrupted downloads', { timeout: 90000 }, async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/page' }); res.end('REDIRECT'); }
    else if (req.url === '/page') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<html><body style="height:2600px"><h1>Capture fixture</h1><script>
        let started = false;
        addEventListener('scroll', () => { if (started || scrollY < 100) return;
          started = true; fetch('/lazy'); fetch('/pending'); });
        </script></body></html>`);
    } else if (req.url === '/lazy') { res.end('LAZY RESOURCE'); }
    else if (req.url === '/pending') { res.writeHead(200); res.write('pending'); }
    else if (req.url === '/large') { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': 100000000 }); res.write(Buffer.alloc(1024)); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fwc-browser-'));
  let browser;
  try {
    const root = path.resolve(__dirname, '../..');
    browser = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, acceptDownloads: true,
      args: ['--no-sandbox', `--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const page = await browser.newPage();
    await page.goto(`${base}/redirect`);
    // Keep a redirect as the reload target to exercise requestId reuse.
    await page.evaluate(() => history.replaceState(null, '', '/redirect'));
    const shot = await worker.evaluate(async base => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const settings = { ...DEFAULT_SETTINGS, format: 'png', features: {
        ...DEFAULT_SETTINGS.features, network: true, har: true, autoScroll: true
      }, advanced: { ...DEFAULT_SETTINGS.advanced, loadTimeout: 4000, settleDelay: 50 } };
      const shot = await capture(tab, settings);
      return { entries: shot.harEntries, collection: shot.network.harCollection, imageSize: shot.image.length };
    }, base);
    assert.ok(shot.imageSize > 100);
    const redirect = shot.entries.find(e => e.response?.status === 302);
    assert.ok(redirect);
    assert.equal(redirect.sha256, undefined);
    assert.equal(redirect.bodyText, undefined);
    assert.equal(redirect.bodyOmitted, 'redirect');
    const lazy = shot.entries.find(e => e.request.url === `${base}/lazy`);
    assert.ok(lazy);
    assert.equal(Buffer.from(lazy.bodyText, lazy.bodyBase64 ? 'base64' : 'utf8').toString(), 'LAZY RESOURCE');
    assert.equal(lazy.sha256, createHash('sha256').update('LAZY RESOURCE').digest('hex'));
    assert.ok(shot.entries.some(e => e.request.url === `${base}/pending` && e.bodyOmitted === 'pending'));
    assert.ok(shot.collection.pending >= 1);
    t.diagnostic(`Chromium ${browser.browser().version()}: ${shot.entries.length} requests, scroll body hash verified`);

    // CDP automation uses a generic filename for data URLs. Filename
    // mismatch rejection is covered separately in tests/download.test.cjs.
    const cdp = await browser.newCDPSession(page);
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(profile, 'downloads') });
    const downloaded = await worker.evaluate(async () => {
      await download(new TextEncoder().encode('complete'), 'text/plain', 'download.txt', '');
      const [item] = await chrome.downloads.search({ query: ['download.txt'] });
      return item.state;
    });
    assert.equal(downloaded, 'complete');
    assert.equal(await fs.readFile(path.join(profile, 'downloads', 'download.txt'), 'utf8'), 'complete');

    const interrupted = await worker.evaluate(async base => {
      // Use an HTTP stream with the real downloads API, while keeping download()'s
      // actual listeners and completion/error handling.
      const original = chrome.downloads.download.bind(chrome.downloads);
      const changed = delta => {
        if (delta.state?.current === 'in_progress') chrome.downloads.cancel(delta.id);
      };
      chrome.downloads.onChanged.addListener(changed);
      chrome.downloads.download = async options => {
        const id = await original({ ...options, url: `${base}/large` });
        await chrome.downloads.cancel(id);
        return id;
      };
      try {
        await download(new Uint8Array([1]), 'application/octet-stream', 'fwc-interrupted.bin', '', 10000);
        return 'unexpected success';
      } catch (err) { return err.message; }
      finally { chrome.downloads.download = original; chrome.downloads.onChanged.removeListener(changed); }
    }, base);
    assert.match(interrupted, /Download not completed/);

    // The support panel stays inside Options and never contacts Satispay on load.
    const options = await browser.newPage();
    const externalRequests = [];
    options.on('request', request => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url());
    });
    const extensionId = new URL(worker.url()).host;
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.locator('#language').selectOption('it');
    await options.bringToFront();
    const card = options.locator('.support-card');
    assert.equal(await card.locator('#supportUsername').textContent(), '@martinandrea86');
    assert.equal(await card.locator('a, details').count(), 0);
    assert.doesNotMatch(await card.textContent(), /andreamartin8|referral|invito/i);
    await options.locator('#copySupportUsername').click();
    await options.getByRole('status').filter({ hasText: 'Nome utente copiato.' }).waitFor();
    // Clipboard denial leaves a usable, selectable identifier.
    await options.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true, value: async () => { throw new Error('Clipboard denied'); }
      });
    });
    await options.locator('#copySupportUsername').click();
    await options.getByRole('status').filter({ hasText: 'Copia non disponibile' }).waitFor();
    for (const language of ['en', 'fr', 'es']) {
      await options.locator('#language').selectOption(language);
      assert.ok((await options.locator('#supportHeading').textContent()).length > 0);
    }
    if (process.env.FWC_STORE_SCREENSHOTS_DIR) {
      const output = path.resolve(process.env.FWC_STORE_SCREENSHOTS_DIR);
      await fs.mkdir(output, { recursive: true });
      await options.setViewportSize({ width: 1280, height: 800 });
      await options.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      for (const language of ['en', 'it']) {
        await options.locator('#language').selectOption(language);
        await options.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
        await options.screenshot({ path: path.join(output, `options-${language}.png`) });
        await options.locator('#custodyOperator').scrollIntoViewIfNeeded();
        await options.screenshot({ path: path.join(output, `custody-${language}.png`) });
      }
    }
    await options.setViewportSize({ width: 375, height: 800 });
    assert.ok(await card.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth));
    assert.deepEqual(externalRequests, []);
    t.diagnostic('Options: public username, no referral, clipboard success/denial, translations and mobile layout verified');

  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
});
