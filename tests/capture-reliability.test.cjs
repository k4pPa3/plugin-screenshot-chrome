const test = require('node:test');
const assert = require('node:assert/strict');
const { context, event } = require('./helpers.cjs');

async function harness() {
  const c = await context();
  const events = event();
  const emit = (method, params = {}) => events.emit({ tabId: 1 }, method, params);
  const calls = [];
  let detached = false;
  c.chrome.debugger = { onEvent: events, attach: async () => {}, detach: async () => { detached = true; } };
  c.sleep = async () => {};
  const request = (id, url, extra = {}) => emit('Network.requestWillBeSent', {
    requestId: id, request: { url }, timestamp: 1, wallTime: 1, ...extra
  });
  const complete = id => {
    emit('Network.responseReceived', { requestId: id, response: { status: 200 } });
    emit('Network.loadingFinished', { requestId: id, timestamp: 2 });
  };
  c.send = async (_, method, params = {}) => {
    calls.push({ method, params });
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
    if (method === 'Page.reload') {
      request('r', 'http://example.test/redirect');
      request('r', 'http://example.test/final', { redirectResponse: { status: 302 }, timestamp: 2 });
      complete('r');
      emit('Page.loadEventFired');
    }
    if (method === 'Page.getLayoutMetrics') return { cssLayoutViewport: { clientWidth: 800, clientHeight: 600 }, cssContentSize: { height: 900 } };
    if (method === 'Page.createIsolatedWorld') return { executionContextId: 1 };
    if (method === 'Page.captureScreenshot') return { data: 'AQ==' };
    if (method === 'Page.getNavigationHistory') return { currentIndex: 0, entries: [{ url: 'http://example.test/final', title: 'Final' }] };
    if (method === 'Network.getResponseBody') return { body: params.requestId === 'r' ? 'FINAL' : 'LAZY', base64Encoded: false };
    return {};
  };
  c.autoScroll = async () => { request('lazy', 'http://example.test/lazy'); complete('lazy'); request('pending', 'http://example.test/pending'); };
  const settings = c.eval('({...DEFAULT_SETTINGS, features:{...DEFAULT_SETTINGS.features,network:true,har:true,autoScroll:true}})');
  return { c, events, calls, settings, detached: () => detached };
}

test('capture includes scroll requests, never attributes final body to redirect, and removes listener', async () => {
  const { c, events, calls, settings, detached } = await harness();
  const shot = await c.capture({ id: 1, url: 'http://example.test/redirect' }, settings);
  const [redirect, final, lazy, pending] = shot.harEntries;
  assert.equal(redirect.bodyOmitted, 'redirect');
  assert.equal(redirect.sha256, undefined);
  assert.equal(redirect.bodyText, undefined);
  assert.equal(final.bodyText, 'FINAL');
  assert.equal(final.sha256, await c.sha256Hex(new TextEncoder().encode('FINAL')));
  assert.equal(lazy.bodyText, 'LAZY');
  assert.equal(pending.bodyOmitted, 'pending');
  assert.equal(calls.filter(x => x.method === 'Network.getResponseBody' && x.params.requestId === 'r').length, 1);
  assert.equal(shot.network.harCollection.pending, 1);
  assert.equal(shot.network.harCollection.loadCompleted, true);
  assert.ok(shot.network.harCollection.startedAt <= shot.network.harCollection.endedAt);
  const har = c.buildHar(shot.harEntries, { collection: shot.network.harCollection });
  assert.equal(har.log._collection.entries, 4);
  assert.equal(events.listeners.size, 0);
  assert.equal(detached(), true);
});

test('capture cleans up HAR listener and debugger when screenshot fails', async () => {
  const { c, events, settings, detached } = await harness();
  const send = c.send;
  c.send = (...args) => args[1] === 'Page.captureScreenshot' ? Promise.reject(new Error('capture failed')) : send(...args);
  await assert.rejects(c.capture({ id: 1 }, settings), /capture failed/);
  assert.equal(events.listeners.size, 0);
  assert.equal(detached(), true);
});

test('HAR request cap bounds unfinished requests and reports discarded requests', async () => {
  const c = await context();
  const r = c.createHarRecorder();
  for (let i = 0; i < 3010; i++) r.onEvent('Network.requestWillBeSent', { requestId: String(i), request: { url: 'http://test/' } });
  assert.equal(r.entries().length, 3000);
  assert.equal(r.summary().droppedRequests, 10);
});

test('localized capture errors reach popup, persist state, and release busy flag', async () => {
  const c = await context();
  c.chrome.runtime.id = 'ext';
  c.chrome.runtime.getURL = p => `chrome-extension://ext/${p}`;
  c.chrome.tabs = { query: async () => [{ id: 1, url: 'chrome://settings' }] };
  const states = [];
  c.chrome.storage.session.set = async state => states.push(state);
  c.chrome.action = { setBadgeText() {}, setBadgeBackgroundColor() {} };
  const sender = { id: 'ext', url: 'chrome-extension://ext/popup.html' };
  for (let i = 0; i < 2; i++) {
    const response = await new Promise(resolve => c.chrome.runtime.onMessage.emit({ type: 'capture' }, sender, resolve));
    assert.equal(response.ok, false);
    assert.equal(response.busy, undefined);
    assert.match(response.error, /page/i);
    assert.equal(states.at(-1).capture.status, 'error');
    assert.equal(states.at(-1).capture.errorMsg.key, 'err.internalPage');
  }
});

test('MHTML alone downloads only the snapshot and skips screenshot work', async () => {
  const { c, calls, detached } = await harness();
  const features = c.eval('Object.fromEntries(Object.keys(DEFAULT_SETTINGS.features).map(key => [key, false]))');
  c.chrome.storage.local.get = async () => ({ settings: { format: 'pdf', features: { ...features, mhtml: true } } });
  const send = c.send;
  c.send = (...args) => args[1] === 'Page.captureSnapshot' ? { data: 'snapshot' } : send(...args);
  c.collectEnvironment = () => assert.fail('No reports requested');
  const downloads = [];
  c.chrome.downloads.download = async options => { downloads.push(options); return 1; };
  c.chrome.downloads.search = async () => [{ state: 'complete', filename: '/chosen/renamed.mhtml' }];

  const result = await c.run({ id: 1, url: 'http://example.test/final' });
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].filename, /\.mhtml$/);
  assert.equal(downloads[0].saveAs, true);
  assert.equal(downloads[0].url, 'data:multipart/related;base64,c25hcHNob3Q=');
  assert.equal(result.hash, await c.sha256Hex(new TextEncoder().encode('snapshot')));
  assert.equal(result.zipHash, null);
  assert.ok(!calls.some(({ method }) => /captureScreenshot|^Emulation\.|^Runtime\./.test(method)));
  assert.equal(detached(), true);

  c.chrome.storage.local.get = async () => ({ settings: { features } });
  await assert.rejects(c.run({ id: 1, url: 'http://example.test/final' }), { code: 'err.noOutput' });
  assert.equal(downloads.length, 1);
});

test('a main-frame navigation during MHTML capture aborts the export and detaches', async () => {
  const { c, events, settings, detached } = await harness();
  settings.features = { ...settings.features, network: false, autoScroll: false, mhtml: true };
  const send = c.send;
  c.send = (...args) => {
    if (args[1] === 'Page.captureSnapshot') {
      events.emit({ tabId: 1 }, 'Page.frameNavigated', { frame: { id: 'main' } });
      return { data: 'different document' };
    }
    return send(...args);
  };
  await assert.rejects(c.capture({ id: 1 }, settings), { code: 'err.documentChanged' });
  assert.equal(events.listeners.size, 0);
  assert.equal(detached(), true);
});
