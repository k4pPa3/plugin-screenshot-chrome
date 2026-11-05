// Uses only a local HTTP fixture; no external pages or TSA services.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

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
  let browser, connection, process;
  try {
    const root = path.resolve(__dirname, '../..');
    // Launch a normal browser profile. Playwright's download interception
    // overrides extension-suggested filenames, invalidating this particular test.
    await fs.mkdir(path.join(profile, 'Default'), { recursive: true });
    await fs.writeFile(path.join(profile, 'Default', 'Preferences'), JSON.stringify({
      download: { default_directory: path.join(profile, 'downloads'), prompt_for_download: false }
    }));
    process = spawn(chromium.executablePath(), [
      '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage',
      `--user-data-dir=${profile}`, '--remote-debugging-port=0',
      `--disable-extensions-except=${root}`, `--load-extension=${root}`, 'about:blank'
    ], { stdio: 'ignore' });
    let port;
    for (let i = 0; i < 100; i++) {
      try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
      catch { await delay(100); }
    }
    assert.ok(port, 'Chromium must expose its debugging port');
    connection = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    browser = connection.contexts()[0];
    const isExtension = worker => worker.url().endsWith('/background.js');
    const worker = browser.serviceWorkers().find(isExtension) || await browser.waitForEvent('serviceworker', { predicate: isExtension });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      ready = await worker.evaluate(() => typeof capture === 'function' && typeof getSettings === 'function');
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, 'Extension worker must finish loading its scripts: ' + JSON.stringify(await worker.evaluate(() => ({ url: location.href, capture: typeof capture, settings: typeof getSettings }))));
    const page = await browser.newPage();
    await page.goto(`${base}/redirect`);
    // Keep a redirect as the reload target to exercise requestId reuse.
    await page.evaluate(() => history.replaceState(null, '', '/redirect'));
    const shot = await worker.evaluate(async base => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const defaults = await getSettings();
      const settings = { ...defaults, format: 'png', features: {
        ...defaults.features, network: true, har: true, autoScroll: true
      }, advanced: { ...defaults.advanced, loadTimeout: 4000, settleDelay: 50 } };
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

    const downloaded = await worker.evaluate(async () => {
      try { await download(new TextEncoder().encode('complete'), 'text/plain', 'fwc-test.txt', ''); }
      catch (err) {
        const items = await chrome.downloads.search({});
        throw new Error(err.message + ' ' + JSON.stringify(items.map(x => ({ filename:x.filename, state:x.state }))));
      }
      const [item] = await chrome.downloads.search({ query: ['fwc-test.txt'] });
      return item.state;
    });
    assert.equal(downloaded, 'complete');

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
  } finally {
    if (connection) await connection.close();
    if (process && process.exitCode === null && process.signalCode === null) {
      const exited = new Promise(resolve => process.once('exit', resolve));
      process.kill('SIGKILL');
      await exited;
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
});
