const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { context, ROOT } = require('./helpers.cjs');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('HAR recorder follows redirects, failures and completed requests', async () => {
  const c = await context();
  const r = c.createHarRecorder();
  r.onEvent('Network.requestWillBeSent', { requestId: '1', request: { method: 'GET', url: 'http://a.test/', headers: { Cookie: 'sid=1' } }, type: 'Document', wallTime: 1793863979, timestamp: 10 });
  r.onEvent('Network.requestWillBeSent', { requestId: '1', request: { method: 'GET', url: 'https://a.test/', headers: {} }, redirectResponse: { status: 301, headers: { Location: 'https://a.test/' } }, type: 'Document', wallTime: 1793863979.1, timestamp: 10.1 });
  r.onEvent('Network.responseReceived', { requestId: '1', response: { status: 200, mimeType: 'text/html', headers: { 'Set-Cookie': 'a=b' }, remoteIPAddress: '1.2.3.4', protocol: 'h2' }, type: 'Document' });
  r.onEvent('Network.loadingFinished', { requestId: '1', timestamp: 10.5, encodedDataLength: 1234 });
  r.onEvent('Network.requestWillBeSent', { requestId: '2', request: { method: 'GET', url: 'https://cdn.test/x.js?v=1', headers: {} }, type: 'Script', wallTime: 1793863979.2, timestamp: 10.2 });
  r.onEvent('Network.loadingFailed', { requestId: '2', timestamp: 10.3, errorText: 'net::ERR_BLOCKED_BY_CLIENT' });
  const entries = r.entries();
  assert.equal(entries.length, 3);
  entries[1].sha256 = 'ab'.repeat(32);
  entries[1].bodyText = '<html>';
  entries[1].bodySize = 6;
  const har = plain(c.buildHar(entries, { creator: 'FWC', version: 't', pageTitle: 'p', startedAt: '2026-11-05T07:32:59Z', redacted: '[x]' }));
  assert.equal(har.log.version, '1.2');
  const [redir, doc, failed] = har.log.entries;
  assert.equal(redir.response.status, 301);
  assert.equal(redir.request.headers.find((h) => h.name === 'Cookie').value, '[x]');
  assert.equal(doc.response.status, 200);
  assert.equal(doc.response.headers.find((h) => h.name === 'Set-Cookie').value, '[x]');
  assert.equal(doc.response.content.text, '<html>');
  assert.equal(doc._sha256, 'ab'.repeat(32));
  assert.equal(doc.serverIPAddress, '1.2.3.4');
  assert.equal(failed._error, 'net::ERR_BLOCKED_BY_CLIENT');
  assert.deepEqual(failed.request.queryString, [{ name: 'v', value: '1' }]);
});

test('extension code file list matches the package and the build fingerprint', async () => {
  const c = await context();
  const listed = [...c.eval('EXTENSION_CODE_FILES')].sort();
  const onDisk = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css'];
  for (const dir of ['lib', '_locales']) {
    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    onDisk.push(...walk(dir));
  }
  assert.deepEqual(listed, onDisk.sort());
  const fp = await c.codeFingerprint(async (name) => new Uint8Array(fs.readFileSync(path.join(ROOT, name))));
  assert.equal(fp.files.length, listed.length);
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const fromBuild = execFileSync(python, [path.join(ROOT, 'tools', 'build.py'), '--fingerprint'], { encoding: 'utf8' }).trim();
  assert.equal(fp.sha256, fromBuild);
});

test('other extensions able to change pages are flagged first; self and disabled are excluded', async () => {
  const c = await context();
  const list = plain(c.describeExtensions([
    { id: 'self', enabled: true, type: 'extension', name: 'me', permissions: [], hostPermissions: [] },
    { id: 'b', enabled: true, type: 'extension', name: 'Benign', permissions: ['storage'], hostPermissions: [] },
    { id: 'a', enabled: true, type: 'extension', name: 'Ad‮block', permissions: ['webRequest'], hostPermissions: ['<all_urls>'] },
    { id: 'd', enabled: false, type: 'extension', name: 'Off', permissions: ['debugger'], hostPermissions: [] },
    { id: 't', enabled: true, type: 'theme', name: 'Theme' }
  ], 'self'));
  assert.deepEqual(list.map((x) => x.id), ['a', 'b']);
  assert.equal(list[0].canAlterPages, true);
  assert.equal(list[0].name, 'Ad block');
  assert.equal(list[1].canAlterPages, false);
});

test('environment, history and qualified TSA appear in the reports', async () => {
  const c = await context();
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png', tsa: {...DEFAULT_SETTINGS.tsa, preset:'aruba', url:'https://tsa.test/'},
      features: {...DEFAULT_SETTINGS.features, jsonReport:true, timestamp:true, zip:true, network:true, har:true}});
    collectEnvironment = async () => ({ code: { sha256: 'cd'.repeat(32), files: [] },
      extensions: [{ id:'a', name:'Spy', version:'1', canAlterPages:true, sensitive:['debugger'] }] });
    capture = async () => ({date:new Date('2026-11-05T08:00:00Z'),url:'https://example.test/',title:'t',width:8,height:6,image:new Uint8Array([1]),
      history:[{url:'https://search.test/?q=x',title:'s',transition:'typed'},{url:'https://example.test/',title:'t',transition:'link'}],
      network:{harCollection:{startedAt:'2026-11-05T07:59:50Z',endedAt:'2026-11-05T08:00:01Z',entries:1,pending:1,droppedRequests:0,bodiesOmitted:1,loadTimedOut:false}},
      harEntries:[{request:{method:'GET',url:'https://example.test/',headers:{}},response:{status:200,headers:{}},sha256:'ef'.repeat(32)}]});
    requestTimestamp = async () => ({tsr:new Uint8Array([9]), status:'granted',verification:'verified',signer:'S',anchor:'A',genTime:'2026-11-05T08:01:00Z'});
    globalThis.outputs=[];
    const originalZip=makeZip;
    makeZip = (files,date) => { globalThis.outputs=files; return originalZip(files,date); };
    download = async () => {};
  `);
  const result = await c.run({ title: 't', url: 'https://example.test/' });
  const files = c.outputs;
  const text = (f) => new TextDecoder().decode(files.find((x) => x.name.endsWith(f)).bytes);
  const json = JSON.parse(text('.report.json'));
  assert.equal(json.environment.code.sha256, 'cd'.repeat(32));
  assert.equal(json.history.length, 2);
  assert.equal(json.network.harCollection.pending, 1);
  assert.equal(json.tsaQualified, true);
  const txt = text('.report.txt');
  assert.match(txt, /search\.test/);
  assert.match(txt, /Spy/);
  assert.match(txt, /HAR observation/);
  assert.ok(result.warnings.map(c.tm).some((w) => /Spy/.test(w)));
  const har = JSON.parse(text('.har'));
  assert.equal(har.log.entries[0]._sha256, 'ef'.repeat(32));
  assert.equal(har.log._collection.pending, 1);
  assert.equal(har.log.pages[0].startedDateTime, '2026-11-05T07:59:50Z');
  assert.ok(result.warnings.map(c.tm).some((w) => /HAR collection/.test(w)));
  assert.match(text('.manifest.sha256'), /\.har/);
});
