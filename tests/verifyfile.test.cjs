const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./helpers.cjs');
const { timestampFixture } = require('./verify-fixture.cjs');

let fixture;
before(async () => { fixture = await timestampFixture(); });

test('saved file is bound to the manifest and a cryptographically verified timestamp', async () => {
  const c = await context();
  c.fetch = () => { throw new Error('Verification must stay offline'); };
  const result = await c.verifyTimestampFile(fixture);
  assert.equal(result.verification, 'verified', result.reason);
  assert.equal(result.binding, 'manifest');
  assert.equal(result.fileHash, await c.sha256Hex(fixture.fileBytes));
  assert.equal(result.targetHash, await c.sha256Hex(fixture.manifestBytes));
  assert.equal(result.signer, 'Verification Test TSA');
  assert.equal(result.anchorSource, 'custom');
});

test('stored timestamp can be verified without its original request nonce', async () => {
  const c = await context();
  const result = await c.verifyTimestampFile({ ...fixture, tsr: fixture.noNonceTsr });
  assert.equal(result.verification, 'verified', result.reason);
  assert.equal(result.nonce, null);
  const hash = await c.sha256Bytes(fixture.manifestBytes);
  assert.throws(() => c.parseTimestampResponse(fixture.noNonceTsr, hash, new Uint8Array([1])), { code: 'tsa.nonce' });
});

test('direct timestamp verification works without a manifest', async () => {
  const c = await context();
  const result = await c.verifyTimestampFile({ ...fixture, tsr: fixture.directTsr, manifestBytes: undefined });
  assert.equal(result.verification, 'verified', result.reason);
  assert.equal(result.binding, 'direct');
});

test('altered evidence and a renamed or unrelated file cannot be verified', async () => {
  const c = await context();
  await assert.rejects(c.verifyTimestampFile({ ...fixture, fileBytes: Buffer.from('altered') }), { code: 'verify.fileMismatch' });
  await assert.rejects(c.verifyTimestampFile({ ...fixture, filename: 'different.txt' }), { code: 'verify.notListed' });
});

test('an altered manifest with matching file hashes still fails the timestamp binding', async () => {
  const c = await context();
  const manifestBytes = Buffer.concat([fixture.manifestBytes, Buffer.from(`${'00'.repeat(32)}  other.txt\n`)]);
  await assert.rejects(c.verifyTimestampFile({ ...fixture, manifestBytes }), { code: 'tsa.mismatch' });
  await assert.rejects(c.verifyTimestampFile({ ...fixture, manifestBytes: undefined }), { code: 'tsa.mismatch' });
});

test('altered token signatures and missing trust anchors never report success', async () => {
  const c = await context();
  const tsr = fixture.tsr.slice();
  tsr[tsr.length - 1] ^= 1;
  assert.equal((await c.verifyTimestampFile({ ...fixture, tsr })).verification, 'invalid');
  assert.equal((await c.verifyTimestampFile({ ...fixture, caPem: '' })).verification, 'untrusted');
});

test('malformed, empty and duplicate manifests fail before cryptographic verification', async () => {
  const c = await context();
  const invalid = [Buffer.from(''), Buffer.from('not a manifest'), Buffer.from([0xff]),
    Buffer.concat([fixture.manifestBytes, fixture.manifestBytes]), Buffer.alloc(4 * 1024 * 1024 + 1)];
  for (const manifestBytes of invalid) {
    await assert.rejects(c.verifyTimestampFile({ ...fixture, manifestBytes }), { code: 'verify.badManifest' });
  }
});

test('CRLF manifests and filenames containing spaces are supported without normalizing signed bytes', async () => {
  const c = await context();
  const entries = c.parseEvidenceManifest(Buffer.from(`${'AB'.repeat(32)} *a file.txt\r\n`));
  assert.equal(entries.get('a file.txt'), 'ab'.repeat(32));
  const manifestBytes = Buffer.from(fixture.manifestBytes.toString().replace(/\n/g, '\r\n'));
  await assert.rejects(c.verifyTimestampFile({ ...fixture, manifestBytes }), { code: 'tsa.mismatch' });
});

test('malformed tokens, oversized tokens and invalid custom CA input fail closed', async () => {
  const c = await context();
  await assert.rejects(c.verifyTimestampFile({ ...fixture, tsr: new Uint8Array([1, 2, 3]) }));
  await assert.rejects(c.verifyTimestampFile({ ...fixture, tsr: new Uint8Array(1024 * 1024 + 1) }), { code: 'tsa.tooLarge' });
  await assert.rejects(c.verifyTimestampFile({ ...fixture, caPem: 'not a certificate' }), { code: 'options.tsa.caPem.invalid' });
});
