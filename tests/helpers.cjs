const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
function event() {
  const listeners = new Set();
  return { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn), emit: (...args) => [...listeners].forEach(fn => fn(...args)), listeners };
}
async function context() {
  const changed = event(), erased = event();
  const c = vm.createContext({
    console, TextEncoder, TextDecoder, Uint8Array, URL, Date, Intl, atob, btoa,
    setTimeout, clearTimeout, setInterval, clearInterval, AbortSignal, crypto: webcrypto,
    navigator: { userAgent: 'regression-test', language: 'en' }, importScripts() {},
    chrome: {
      runtime: { onInstalled: event(), onMessage: event(), getManifest: () => ({ name: 'Forensic Web Capture', version: 'test' }) },
      storage: { local: { get: async () => ({}) }, session: { get: async () => ({}) }, onChanged: event() },
      permissions: { contains: async () => true },
      downloads: { onChanged: changed, onErased: erased, download: async () => 1, search: async () => [{ state: 'complete' }] }
    }
  });
  for (const file of ['lib/i18n.js', 'lib/locales/en.js', 'lib/locales/it.js', 'lib/locales/fr.js', 'lib/locales/es.js', 'lib/common.js', 'lib/tsa.js', 'lib/tsaroots.js', 'lib/tsaverify.js', 'lib/zip.js', 'lib/pdf.js', 'lib/vault.js', 'lib/har.js', 'lib/integrity.js', 'lib/netcontext.js', 'lib/cookies.js', 'lib/eml.js', 'lib/reporthtml.js', 'background.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c, { filename: file });
  }
  await Promise.resolve();
  c.eval = (source) => vm.runInContext(source, c);
  return c;
}
module.exports = { context, event, ROOT };
