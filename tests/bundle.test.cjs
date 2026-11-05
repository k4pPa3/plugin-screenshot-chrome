const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { context } = require('./helpers.cjs');
const text = bytes => new TextDecoder().decode(bytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function verify(sums, files) {
  return text(sums).trim().split('\n').every(line => {
    const [expected, name] = line.split('  ');
    const file = files.find(f => f.name === name);
    return file && hash(file.bytes) === expected;
  });
}
async function bundle({ timestamp = true, zip = true, failTsa = false, verification = 'untrusted' } = {}) {
  const c = await context();
  c.testOptions = { timestamp, zip, failTsa, verification };
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png', features: {...DEFAULT_SETTINGS.features, html:true, mhtml:true, jsonReport:true, timestamp:testOptions.timestamp, zip:testOptions.zip}});
    capture = async () => ({date:new Date('2026-11-05T08:00:00Z'),url:'https://example.test/',title:'hostile title',width:800,height:600,image:new Uint8Array([1,2,3]),html:new TextEncoder().encode(protectHtml('<script>test</script>')),mhtml:new Uint8Array([4,5,6])});
    requestTimestamp = async (hash) => { globalThis.stampedHash=toHex(hash); if(testOptions.failTsa) throw Error('TSA unavailable'); return {tsr:new Uint8Array([9,8,7]), status:'granted',verification:testOptions.verification,reason:'test reason',signer:'Test TSA',anchor:'Test Root',genTime:'2026-11-05T08:01:00Z'}; };
    globalThis.outputs=[];
    const originalZip=makeZip;
    makeZip = (files,date) => { globalThis.outputs=files; return originalZip(files,date); };
    download = async (bytes,mime,name) => { if (!testOptions.zip) globalThis.outputs.push({bytes,mime,name}); };
  `);
  const result = await c.run({ title: '$(Write-Output INJECTED)', url: 'https://example.test/' });
  return { c, result, files: c.outputs };
}

test('timestamp binds the manifest, including both reports; all files have checksums', async () => {
  const { c, result, files } = await bundle();
  const manifest = files.find(f => f.name.endsWith('.manifest.sha256'));
  const sums = files.find(f => f.name === 'SHA256SUMS.txt');
  assert.equal(c.stampedHash, hash(manifest.bytes));
  assert.match(text(manifest.bytes), /\.report.txt/);
  assert.match(text(manifest.bytes), /\.report.json/);
  assert.doesNotMatch(text(manifest.bytes), /\.tsr|\.timestamp.json/);
  assert.equal(verify(manifest.bytes, files), true);
  assert.equal(verify(sums.bytes, files), true);
  assert.equal(text(sums.bytes).trim().split('\n').length, files.length - 1);
  assert.equal(result.timestampVerification, 'untrusted');
  assert.ok(result.warnings.map(c.tm).some(w => /does not chain to a trusted CA \(test reason\)/.test(w)));
  for (const f of files) assert.match(f.name, /^(capture_[0-9A-Za-z_.-]+|SHA256SUMS.txt)$/);
  const report = JSON.parse(text(files.find(f => f.name.endsWith('.report.json')).bytes));
  assert.equal(report.timestamp.target, manifest.name);
  assert.equal(report.timestamp.status, 'requested');
  const receipt = JSON.parse(text(files.find(f => f.name.endsWith('.timestamp.json')).bytes));
  assert.equal(receipt.targetSha256, hash(manifest.bytes));
  assert.equal(receipt.verification, 'untrusted');
  assert.match(receipt.verificationText, /Test TSA/);
  assert.equal(receipt.status, 'granted');
});

test('changing either report invalidates the manifest and final checksums', async () => {
  for (const suffix of ['.report.txt', '.report.json']) {
    const { files } = await bundle();
    files.find(f => f.name.endsWith(suffix)).bytes = new TextEncoder().encode('modified');
    assert.equal(verify(files.find(f => f.name.endsWith('.manifest.sha256')).bytes, files), false);
    assert.equal(verify(files.find(f => f.name === 'SHA256SUMS.txt').bytes, files), false);
  }
});

test('failed TSA keeps evidence, records failure, emits warning and hashes receipt', async () => {
  const { c, result, files } = await bundle({ failTsa: true });
  assert.equal(files.some(f => f.name.endsWith('.tsr')), false);
  const receipt = JSON.parse(text(files.find(f => f.name.endsWith('.timestamp.json')).bytes));
  assert.equal(receipt.status, 'failed');
  assert.equal(result.genTime, null);
  assert.match(result.warnings.map(c.tm).join(' '), /TSA unavailable/);
  assert.equal(verify(files.find(f => f.name === 'SHA256SUMS.txt').bytes, files), true);
});

test('loose-file and TSA-disabled exports still include complete checksum coverage', async () => {
  const { files } = await bundle({ timestamp: false, zip: false });
  assert.equal(files.some(f => f.name.endsWith('.tsr')), false);
  const sums = files.find(f => f.name.endsWith('.SHA256SUMS.txt'));
  assert.ok(sums);
  assert.equal(verify(sums.bytes, files), true);
  assert.equal(text(sums.bytes).trim().split('\n').length, files.length - 1);
});

test('verified timestamp is reported as a note, not a warning', async () => {
  const { c, result, files } = await bundle({ verification: 'verified' });
  assert.equal(result.timestampVerification, 'verified');
  assert.ok(result.notes.map(c.tm).some(n => /Timestamp verified: valid signature by .Test TSA., certificate chain up to Test Root/.test(n)));
  assert.ok(!result.warnings.map(c.tm).some(w => /Timestamp/.test(w)));
  const receipt = JSON.parse(text(files.find(f => f.name.endsWith('.timestamp.json')).bytes));
  assert.equal(receipt.anchor, 'Test Root');
});

test('invalid timestamp signature produces a warning', async () => {
  const { c, result } = await bundle({ verification: 'invalid' });
  assert.ok(result.warnings.map(c.tm).some(w => /signature NOT valid \(test reason\)/.test(w)));
});
