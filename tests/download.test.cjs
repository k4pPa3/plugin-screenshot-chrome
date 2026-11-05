const test = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./helpers.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function noListeners(c) {
  assert.equal(c.chrome.downloads.onChanged.listeners.size, 0);
  assert.equal(c.chrome.downloads.onErased.listeners.size, 0);
}

test('download stays pending until Chrome confirms completion', async () => {
  const c = await context(); let state = 'in_progress', done = false;
  c.chrome.downloads.search = async () => [{ state, filename: '/Downloads/test.txt' }];
  const p = c.download(new Uint8Array([1]), 'text/plain', 'test.txt', '', 1000).then(() => { done = true; });
  await tick(); assert.equal(done, false);
  c.chrome.downloads.onChanged.emit({ id: 99, state: { current: 'complete' } });
  await tick(); assert.equal(done, false);
  state = 'complete';
  c.chrome.downloads.onChanged.emit({ id: 1, state: { current: state } });
  await p; assert.equal(done, true); noListeners(c);
});

test('completion before download ID resolves is recovered by search', async () => {
  const c = await context();
  c.chrome.downloads.download = async () => { c.chrome.downloads.onChanged.emit({ id: 1, state: { current: 'complete' } }); return 1; };
  assert.equal(await c.download(new Uint8Array(), 'text/plain', 'test.txt', '', 1000), 1);
  noListeners(c);
});

for (const condition of ['interrupted', 'missing', 'renamed', 'removed', 'timeout', 'api-error']) {
  test(`download rejects ${condition} and cleans listeners`, async () => {
    const c = await context();
    c.chrome.downloads.search = async () => [{ state: 'in_progress' }];
    if (condition === 'interrupted') c.chrome.downloads.search = async () => [{ state: 'interrupted', error: 'FILE_NO_SPACE' }];
    if (condition === 'missing') c.chrome.downloads.search = async () => [];
    if (condition === 'renamed') c.chrome.downloads.search = async () => [{ state: 'complete', filename: '/Downloads/test (1).txt' }];
    if (condition === 'api-error') c.chrome.downloads.download = async () => { throw Error('blocked'); };
    const p = c.download(new Uint8Array(), 'text/plain', 'test.txt', '', 25);
    const rejected = assert.rejects(p);
    if (condition === 'removed') { await tick(); c.chrome.downloads.onErased.emit(1); }
    await rejected; noListeners(c);
  });
}
