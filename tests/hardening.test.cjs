const test = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./helpers.cjs');

test('only http, https and file pages are capturable', async () => {
  const c = await context();
  for (const url of ['https://example.com/', 'http://example.com/a?b', 'file:///C:/x.html']) {
    assert.equal(c.isCapturableUrl(url), true, url);
  }
  for (const url of ['chrome://settings', 'view-source:https://example.com', 'data:text/html,x',
    'blob:https://example.com/1', 'chrome-untrusted://x', 'chrome-search://x', 'brave://x',
    'edge://x', 'about:blank', 'chrome-extension://abc/x.html', 'devtools://x', 'ftp://x', '', undefined]) {
    assert.equal(c.isCapturableUrl(url), false, String(url));
  }
});

test('messages are accepted only from the action popup', async () => {
  const c = await context();
  c.chrome.runtime.id = 'ext';
  c.chrome.runtime.getURL = (p) => `chrome-extension://ext/${p}`;
  const ok = { id: 'ext', url: 'chrome-extension://ext/popup.html' };
  assert.equal(c.isPopupSender(ok), true);
  for (const s of [
    { ...ok, id: 'other' },
    { ...ok, tab: { id: 1 } },
    { ...ok, url: 'chrome-extension://ext/popup.html?x' },
    { ...ok, url: 'chrome-extension://ext/popup.html#x' },
    { ...ok, url: 'chrome-extension://ext/popup.html.evil' },
    { ...ok, url: 'chrome-extension://ext/options.html' },
    { ...ok, url: 'https://example.com/popup.html' },
    { id: 'ext' }, undefined
  ]) assert.equal(c.isPopupSender(s), false, JSON.stringify(s));
});

test('custom TSA header names must be valid, non-reserved tokens', async () => {
  const c = await context();
  for (const n of ['', '  ', 'X-API-Key', 'apikey', 'X_Token.1']) assert.equal(c.isValidHeaderName(n), true, n);
  for (const n of ['Host', 'content-type', 'Authorization', 'Cookie', 'Content-Length', 'Sec-Fetch-Mode',
    'Proxy-Authorization', 'X Key', 'X:Key', 'X-Key\r\nEvil: 1', 'Chiave-è']) {
    assert.equal(c.isValidHeaderName(n), false, n);
  }
});

test('requestTimestamp refuses an invalid header before any network call', async () => {
  const c = await context();
  let called = false;
  c.fetch = async () => { called = true; throw new Error('no'); };
  await assert.rejects(c.requestTimestamp(new Uint8Array(32), { url: 'https://tsa.example/', headerName: 'Host', headerValue: 'x' }),
    (e) => e.code === 'tsa.badHeader');
  assert.equal(called, false);
});

test('TSA URLs on local or private networks are flagged', async () => {
  const c = await context();
  for (const u of ['http://localhost/', 'https://a.localhost/', 'http://127.0.0.1:8080/', 'http://10.1.2.3/',
    'http://172.16.0.1/', 'http://172.31.255.1/', 'http://192.168.1.1/', 'http://169.254.169.254/latest',
    'http://0.0.0.0/', 'http://100.64.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/', 'http://tsa.local/', 'http://tsa.internal/']) {
    assert.equal(c.isPrivateHost(u), true, u);
  }
  for (const u of ['https://freetsa.org/tsr', 'http://timestamp.digicert.com', 'http://172.32.0.1/',
    'http://8.8.8.8/', 'http://[2001:db8::1]/', 'not a url', '']) {
    assert.equal(c.isPrivateHost(u), false, u);
  }
});
