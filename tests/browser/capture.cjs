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
      res.setHeader('Set-Cookie', 'fwc_session=secret-cookie-value; Path=/; HttpOnly');
      res.end(`<html><body style="height:2600px"><h1>Capture fixture</h1><script>localStorage.setItem('fwc_key', 'secret-storage-value')</script><a href="/lazy">lazy link</a><svg><a href="/svg-link"><text>svg</text></a></svg><script>
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
      // English UI on any machine: assertions match English messages.
      args: ['--no-sandbox', '--lang=en-US', `--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const page = await browser.newPage();
    await page.goto(`${base}/redirect`);
    // Keep a redirect as the reload target to exercise requestId reuse.
    await page.evaluate(() => history.replaceState(null, '', '/redirect'));
    const shot = await worker.evaluate(async base => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const settings = { ...DEFAULT_SETTINGS, format: 'png', features: {
        ...DEFAULT_SETTINGS.features, network: true, har: true, autoScroll: true, text: true, storage: true
      }, advanced: { ...DEFAULT_SETTINGS.advanced, loadTimeout: 4000, settleDelay: 50 } };
      const shot = await capture(tab, settings);
      // As in run(): the URL from the navigation history (tab.url needs the tabs permission).
      const state = await buildBrowserState(shot.browserState, { pageUrl: shot.url, includeValues: false, collectedAt: shot.browserState.at });
      return { entries: shot.harEntries, collection: shot.network.harCollection, imageSize: shot.image.length, text: shot.text,
        storageError: shot.storageError || null, state };
    }, base);
    assert.ok(shot.imageSize > 100);
    // Visible text and link list read from the isolated world.
    assert.match(shot.text.text, /Capture fixture/);
    // SVG links, if the browser lists them, must be real URLs, not "[object ...]".
    assert.ok(shot.text.links.includes(`${base}/lazy`));
    for (const link of shot.text.links) assert.match(link, /^http:\/\/127\.0\.0\.1:\d+\/(lazy|svg-link)$/);
    assert.equal(shot.text.totalLinks, shot.text.links.length);
    t.diagnostic(`text links: ${shot.text.links.join(', ')}`);
    // Cookies (including HttpOnly) via the debugger and localStorage via the
    // isolated world; values are reduced to SHA-256.
    assert.equal(shot.storageError, null);
    const cookie = shot.state.cookies.find(c => c.name === 'fwc_session');
    assert.ok(cookie && cookie.httpOnly && !cookie.thirdParty);
    assert.equal(cookie.valueSha256, createHash('sha256').update('secret-cookie-value').digest('hex'));
    const item = shot.state.localStorage.entries.find(e => e.key === 'fwc_key');
    assert.equal(item.valueSha256, createHash('sha256').update('secret-storage-value').digest('hex'));
    assert.doesNotMatch(JSON.stringify(shot.state), /secret-(cookie|storage)-value/);
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

    // Open the popup as a page to verify the actual controls and saved settings.
    const extensionId = new URL(worker.url()).host;
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('[data-feature="screenshot"]').waitFor({ state: 'attached' });
    await popup.waitForFunction(() => document.querySelector('[data-feature="screenshot"]').checked);
    await popup.evaluate(() => {
      for (const input of [...document.querySelectorAll('[data-feature]')].reverse()) {
        const enabled = input.dataset.feature === 'mhtml';
        if (input.checked !== enabled) input.click();
      }
    });
    await popup.waitForFunction(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      return Object.entries(settings?.features || {}).filter(([, enabled]) => enabled).map(([key]) => key).join() === 'mhtml';
    });
    assert.equal(await popup.locator('#format').isDisabled(), true);
    assert.equal(await popup.locator('[data-feature="printPdf"]').isDisabled(), true);
    await popup.close();
    await page.bringToFront();

    const mhtmlExport = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const original = chrome.downloads.download.bind(chrome.downloads);
      const downloads = [];
      let downloadId;
      chrome.downloads.download = async options => {
        downloads.push({ filename: options.filename, saveAs: options.saveAs });
        // Headless Chromium has no native file picker. Route the download to the CDP test directory.
        downloadId = await original({ ...options, saveAs: false });
        return downloadId;
      };
      try {
        const result = await run(tab);
        const [item] = await chrome.downloads.search({ id: downloadId });
        return { downloads, result, savedPath: item.filename };
      } finally {
        chrome.downloads.download = original;
      }
    });
    assert.deepEqual(mhtmlExport.downloads, [{ filename: mhtmlExport.result.filename, saveAs: true }]);
    assert.match(mhtmlExport.result.filename, /\.mhtml$/);
    const mhtml = await fs.readFile(mhtmlExport.savedPath, 'utf8');
    assert.match(mhtml, /Content-Type: multipart\/related/i);
    assert.match(mhtml, /Capture fixture/);
    assert.equal(createHash('sha256').update(mhtml).digest('hex'), mhtmlExport.result.hash);

    // The support panel stays inside Options and never contacts Satispay on load.
    const options = await browser.newPage();
    const externalRequests = [];
    options.on('request', request => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url());
    });
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
        await options.locator('#custodyOperator').evaluate(el => el.closest('section').scrollIntoView({ block: 'start' }));
        await options.screenshot({ path: path.join(output, `custody-${language}.png`) });
      }
    }
    await options.setViewportSize({ width: 375, height: 800 });
    assert.ok(await card.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth));
    assert.deepEqual(externalRequests, []);
    // The updater is dormant until requested, and downloads the extension ZIP.
    const checkUpdates = options.locator('#checkUpdates');
    await checkUpdates.waitFor();
    assert.equal(await options.locator('#installedVersion').textContent(),
      await worker.evaluate(() => chrome.runtime.getManifest().version));
    assert.deepEqual(externalRequests, []);
    const updateUrl = 'https://github.com/k4pPa3/plugin-screenshot-chrome/releases/download/v99.0.0/forensic-web-capture-99.0.0.zip';
    await options.evaluate(async updateUrl => {
      const calls = window.updateCalls = [];
      chrome.permissions.request = async details => { calls.push(details); return true; };
      const bytes = new Uint8Array([80, 75, 3, 4]);
      const digest = await sha256Hex(bytes);
      const fetchOriginal = window.fetch;
      window.fetch = async (url, init) => {
        if (url === updateUrl) {
          calls.push(String(url));
          const response = new Response(bytes);
          Object.defineProperty(response, 'url', { value: updateUrl });
          return response;
        }
        if (!String(url).startsWith('https://api.github.com/')) return fetchOriginal.call(window, url, init);
        calls.push(String(url));
        return Response.json({
          tag_name: 'v99.0.0', draft: false, prerelease: false,
          assets: [{ name: 'forensic-web-capture-99.0.0.zip', state: 'uploaded', browser_download_url: updateUrl, size: bytes.length, digest: `sha256:${digest}` }]
        });
      };
      chrome.downloads.download = async details => {
        const bytes = new Uint8Array(await (await window.fetch(details.url)).arrayBuffer());
        calls.push({ ...details, url: Array.from(bytes) });
        return 1;
      };
    }, updateUrl);
    await checkUpdates.click();
    await options.locator('#updateStatus').filter({ hasText: '99.0.0' }).waitFor();
    await options.locator('#downloadUpdate').click();
    await options.waitForFunction(() => window.updateCalls.length === 5);
    assert.deepEqual(await options.evaluate(() => window.updateCalls), [
      { origins: ['https://api.github.com/*'] },
      'https://api.github.com/repos/k4pPa3/plugin-screenshot-chrome/releases/latest',
      { origins: ['https://github.com/*', 'https://release-assets.githubusercontent.com/*'] },
      updateUrl,
      { url: [80, 75, 3, 4], filename: 'forensic-web-capture-99.0.0.zip', saveAs: true, conflictAction: 'uniquify' }
    ]);

    t.diagnostic('Options: public username, no referral, clipboard success/denial, translations and mobile layout verified');

  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
});
