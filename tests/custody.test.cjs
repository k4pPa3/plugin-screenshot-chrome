const test = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./helpers.cjs');
const text = (bytes) => new TextDecoder().decode(bytes);

async function bundle(custody, advanced = {}) {
  const c = await context();
  c.testCustody = custody;
  c.testAdvanced = advanced;
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png', custody: {...DEFAULT_SETTINGS.custody, ...testCustody},
      advanced: {...DEFAULT_SETTINGS.advanced, ...testAdvanced},
      features: {...DEFAULT_SETTINGS.features, jsonReport:true, timestamp:true, zip:true}});
    capture = async (tab, settings, { log }) => { log('debugger.attach', { url: tab.url }); log('screenshot', { bytes: 3 });
      return {date:new Date('2026-11-05T08:00:00Z'),url:'https://example.test/',title:'t',width:800,height:600,image:new Uint8Array([1,2,3])}; };
    requestTimestamp = async () => ({tsr:new Uint8Array([9]), status:'granted',verification:'verified',signer:'S',anchor:'A',genTime:'2026-11-05T08:01:00Z'});
    globalThis.outputs=[];
    const originalZip=makeZip;
    makeZip = (files,date) => { globalThis.outputs=files; return originalZip(files,date); };
    download = async () => {};
  `);
  await c.run({ title: 't', url: 'https://example.test/' });
  return { c, files: c.outputs };
}

test('custody data and operation log are in both reports, which the manifest binds', async () => {
  const { files } = await bundle({ operator: 'Mario‮Rossi', organization: 'Studio X', caseRef: 'RG 123/2026', notes: 'riga1\nriga2' });
  const json = JSON.parse(text(files.find((f) => f.name.endsWith('.report.json')).bytes));
  assert.deepEqual(json.custody, { operator: 'Mario Rossi', organization: 'Studio X', caseRef: 'RG 123/2026', notes: 'riga1 riga2' });
  const steps = json.log.map((e) => e.step);
  for (const s of ['acquisition.start', 'debugger.attach', 'screenshot', 'evidence.hash', 'report.build']) assert.ok(steps.includes(s), s);
  for (const e of json.log) assert.match(e.at, /^\d{4}-\d\d-\d\dT.*Z$/);
  const txt = text(files.find((f) => f.name.endsWith('.report.txt')).bytes);
  assert.match(txt, /RG 123\/2026/);
  assert.match(txt, /report\.build/);
  const manifest = text(files.find((f) => f.name.endsWith('.manifest.sha256')).bytes);
  assert.match(manifest, /\.report\.json/);
  const receipt = JSON.parse(text(files.find((f) => f.name.endsWith('.timestamp.json')).bytes));
  assert.deepEqual(receipt.log.map((e) => e.step), ['manifest.build', 'tsa.request', 'tsa.response']);
});

test('missing custody fields are reported as not given', async () => {
  const { c, files } = await bundle({});
  const txt = text(files.find((f) => f.name.endsWith('.report.txt')).bytes);
  assert.ok(txt.includes(c.t('custody.notGiven')));
});

test('required custody blocks the capture before anything is saved', async () => {
  const c = await context();
  c.eval(`getSettings = async () => ({...DEFAULT_SETTINGS, advanced: {...DEFAULT_SETTINGS.advanced, custodyRequired: true}});
    capture = async () => { throw new Error('should not capture'); };`);
  await assert.rejects(c.run({ url: 'https://example.test/' }), (e) => e.code === 'err.custodyMissing');
});

test('cleanCustody strips control and bidi characters and limits length', async () => {
  const c = await context();
  const r = c.cleanCustody({ operator: 'a\u0000b⁦c', notes: 'x'.repeat(5000) });
  assert.equal(r.operator, 'a b c');
  assert.equal(r.notes.length, 1000);
  assert.equal(r.caseRef, '');
});
