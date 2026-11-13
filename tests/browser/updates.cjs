const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { context, ROOT } = require('../helpers.cjs');

test('updater uses real browser file handles, preserves a backup and offers reload', { timeout: 60000 }, async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fwc-install-browser-'));
  let browser;
  try {
    browser = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      args: ['--no-sandbox', '--lang=en-US', `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`] });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const page = await browser.newPage();
    await page.goto(worker.url().replace(/background\.js$/, 'options.html'));
    await page.waitForSelector('#githubUpdates:not([hidden])');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const c = await context();
    const manifest = { ...JSON.parse(await fs.readFile(path.join(ROOT, 'manifest.json'), 'utf8')), version: '99.0.0' };
    const bytes = c.makeZip(['manifest.json', 'background.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css'].map(name =>
      ({ name, bytes: Buffer.from(name === 'manifest.json' ? JSON.stringify(manifest) : `new ${name}`) })), new Date());
    const initialManifest = JSON.parse(await fs.readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
    await page.evaluate(async ({ bytes, initialManifest }) => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('extension-test', { create: true });
      const save = async (name, text) => { const stream = await (await directory.getFileHandle(name, { create: true })).createWritable(); await stream.write(text); await stream.close(); };
      await save('manifest.json', JSON.stringify(initialManifest));
      await save('popup.js', 'original popup');
      await save('evidence.txt', 'keep private evidence');
      window.selectedDirectory = directory;
      window.showDirectoryPicker = async () => { window.pickerHasGesture = navigator.userActivation.isActive; return directory; };
      chrome.permissions.request = async () => true;
      const data = new Uint8Array(bytes);
      const digest = await sha256Hex(data);
      const url = 'https://github.com/k4pPa3/plugin-screenshot-chrome/releases/download/v99.0.0/forensic-web-capture-99.0.0.zip';
      window.fetch = async endpoint => {
        if (String(endpoint).startsWith('https://api.github.com/')) return Response.json({ tag_name: 'v99.0.0', draft: false, prerelease: false,
          assets: [{ name: 'forensic-web-capture-99.0.0.zip', state: 'uploaded', browser_download_url: url, size: data.length, digest: `sha256:${digest}` }] });
        const response = new Response(data); Object.defineProperty(response, 'url', { value: url }); return response;
      };
      chrome.runtime.reload = () => { window.reloaded = true; };
    }, { bytes: Array.from(bytes), initialManifest });
    await page.locator('#checkUpdates').click();
    await page.locator('#installUpdate').waitFor({ state: 'visible' });
    await page.locator('#installUpdate').click();
    await page.locator('#reloadUpdate').waitFor({ state: 'visible' });
    const result = await page.evaluate(async () => {
      const read = async (dir, name) => (await (await dir.getFileHandle(name)).getFile()).text();
      const names = []; for await (const name of selectedDirectory.keys()) names.push(name);
      const backup = names.find(name => name.startsWith('.fwc-backup-'));
      const backupDir = await selectedDirectory.getDirectoryHandle(backup);
      return { manifest: JSON.parse(await read(selectedDirectory, 'manifest.json')), backup,
        oldPopup: await read(backupDir, 'popup.js'), evidence: await read(selectedDirectory, 'evidence.txt'), gesture: pickerHasGesture };
    });
    assert.equal(result.manifest.version, '99.0.0');
    assert.equal(result.oldPopup, 'original popup');
    assert.equal(result.evidence, 'keep private evidence');
    assert.equal(result.gesture, true);
    await page.locator('#reloadUpdate').click();
    assert.equal(await page.evaluate(() => reloaded), true);
    assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); await fs.rm(profile, { recursive: true, force: true }); }
});

test('standalone updater upgrades 1.8.2 to 1.8.3 in the same directory and preserves extension identity and settings', { timeout: 90000 }, async () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  execFileSync(python, [path.join(ROOT, 'tools/build.py')], { cwd: ROOT });
  const version = JSON.parse(await fs.readFile(path.join(ROOT, 'manifest.json'), 'utf8')).version;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'fwc-upgrade-'));
  const installation = path.join(temp, 'extension');
  await fs.mkdir(installation);
  const previous = { ...JSON.parse(await fs.readFile(path.join(ROOT, 'manifest.json'), 'utf8')), version: '1.8.2' };
  await fs.writeFile(path.join(installation, 'manifest.json'), JSON.stringify(previous));
  await fs.writeFile(path.join(installation, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
  await fs.writeFile(path.join(installation, 'popup.html'), '<!doctype html><p>1.8.2</p>');
  await fs.writeFile(path.join(installation, 'options.html'), '<!doctype html><p>1.8.2 settings</p>');
  await fs.cp(path.join(ROOT, 'icons'), path.join(installation, 'icons'), { recursive: true });
  await fs.cp(path.join(ROOT, '_locales'), path.join(installation, '_locales'), { recursive: true });
  await fs.writeFile(path.join(installation, 'keep.txt'), 'keep existing files');
  let browser;
  try {
    browser = await chromium.launchPersistentContext(path.join(temp, 'profile'), { channel: 'chromium', headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--no-sandbox', '--lang=en-US', `--disable-extensions-except=${installation}`, `--load-extension=${installation}`] });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const old = await worker.evaluate(async () => {
      await chrome.storage.local.set({ settings: { language: 'it', custody: { operator: 'Upgrade test', caseRef: 'TEST-183' } } });
      return { id: chrome.runtime.id, version: chrome.runtime.getManifest().version };
    });
    assert.equal(old.version, '1.8.2');
    // Command-line loading bypasses Chrome's developer-mode switch initially,
    // but reloads require the same switch a real unpacked installation uses.
    const developerPage = await browser.newPage();
    await developerPage.goto('chrome://extensions/');
    const developerMode = developerPage.locator('#devMode');
    if (!await developerMode.evaluate(element => element.checked)) await developerMode.click();
    const page = await browser.newPage();
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    // Only the native directory dialog is replaced. Writes go to a real temporary
    // installation; the first test above covers the native File System Access API.
    await page.exposeBinding('testFilesystem', async (_, { operation, name, create, data }) => {
      const destination = path.resolve(installation, name || '.');
      const relative = path.relative(installation, destination);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Outside fixture');
      if (operation === 'directory') { if (create) await fs.mkdir(destination, { recursive: true }); else await fs.stat(destination); return; }
      if (operation === 'file') { if (create) { try { await fs.writeFile(destination, '', { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; } } else await fs.stat(destination); return; }
      if (operation === 'read') return Array.from(await fs.readFile(destination));
      if (operation === 'write') return fs.writeFile(destination, Buffer.from(data));
      if (operation === 'remove') return fs.unlink(destination);
      throw new Error('Unexpected operation');
    });
    await page.addInitScript(() => {
      const call = async request => { try { return await testFilesystem(request); } catch (error) {
        if (/ENOENT/.test(error.message)) throw new DOMException('Missing file', 'NotFoundError'); throw error;
      } };
      const directory = (prefix = '') => ({ kind: 'directory', name: 'extension',
        async getDirectoryHandle(name, options = {}) { await call({ operation: 'directory', name: prefix + name, create: options.create }); return directory(prefix + name + '/'); },
        async getFileHandle(name, options = {}) { const full = prefix + name; await call({ operation: 'file', name: full, create: options.create }); return {
          async getFile() { return new File([new Uint8Array(await call({ operation: 'read', name: full }))], name); },
          async createWritable() { let data; return { async write(bytes) { data = Array.from(bytes); }, async close() { await call({ operation: 'write', name: full, data }); }, async abort() {} }; }
        }; },
        async removeEntry(name) { return call({ operation: 'remove', name: prefix + name }); }
      });
      window.showDirectoryPicker = async () => { window.pickerHasGesture = navigator.userActivation.isActive; return directory(); };
    });
    await page.goto(pathToFileURL(path.join(ROOT, `dist/forensic-web-capture-update-${version}.html`)).href);
    await page.locator('#install').click();
    await page.locator('#status.ok').waitFor();
    assert.equal(await page.evaluate(() => pickerHasGesture), true);
    const installed = JSON.parse(await fs.readFile(path.join(installation, 'manifest.json'), 'utf8'));
    assert.equal(installed.version, version);
    assert.equal(await fs.readFile(path.join(installation, 'keep.txt'), 'utf8'), 'keep existing files');
    const backup = (await fs.readdir(installation)).find(name => name.startsWith('.fwc-backup-1.8.2-'));
    assert.equal(JSON.parse(await fs.readFile(path.join(installation, backup, 'manifest.json'), 'utf8')).version, '1.8.2');
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
    // A reloaded MV3 worker can stay dormant until the next event. Read the
    // installed version from the popup rather than requiring an eager worker.
    const popup = await browser.newPage();
    for (let attempt = 0; ; attempt++) {
      try { await popup.goto(`chrome-extension://${old.id}/popup.html`); break; }
      catch (error) { if (attempt >= 49) throw error; await popup.waitForTimeout(100); }
    }
    await popup.locator('#openVerify').waitFor();
    const updated = await popup.evaluate(async () => ({ id: chrome.runtime.id,
      version: chrome.runtime.getManifest().version, settings: (await chrome.storage.local.get('settings')).settings }));
    assert.equal(updated.id, old.id);
    assert.equal(updated.version, version);
    assert.equal(updated.settings.custody.caseRef, 'TEST-183');
    assert.equal(await popup.locator('#openVerify').innerText(), 'Verifica marca temporale');
  } finally { if (browser) await browser.close(); await fs.rm(temp, { recursive: true, force: true }); }
});
