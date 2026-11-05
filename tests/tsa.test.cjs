const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { context } = require('./helpers.cjs');

async function fixture() {
  const c = await context();
  c.eval(`
    const expectedHash = new Uint8Array(32).fill(7);
    const expectedNonce = new Uint8Array([1,2,3,4]);
    function responseFixture({ nonce = expectedNonce, algorithm = OID_SHA256, contentType = '1.2.840.113549.1.9.16.1.4', hash = expectedHash, signature = true, time = '20261105080000Z' } = {}) {
      const tst = der(0x30, concat(der(2,[1]),encodeOid('1.2.3.4'),der(0x30,concat(der(0x30,encodeOid(algorithm)),der(4,hash))),der(2,[1]),der(0x18,new TextEncoder().encode(time)),nonce ? der(2,nonce) : new Uint8Array()));
      const encap = der(0x30,concat(encodeOid(contentType),der(0xa0,der(4,tst))));
      const alg = der(0x30,encodeOid(OID_SHA256));
      const signer = der(0x30,concat(der(2,[1]),der(0x30,[]),alg,alg,der(4,[1])));
      const signed = der(0x30,concat(der(2,[1]),der(0x31,alg),encap,der(0x31,signature ? signer : [])));
      const token = der(0x30,concat(encodeOid('1.2.840.113549.1.7.2'),der(0xa0,signed)));
      return der(0x30,concat(der(0x30,der(2,[0])),token));
    }
  `);
  return c;
}

for (const [name, options] of [
  ['missing nonce', '{nonce:null}'], ['wrong nonce', '{nonce:new Uint8Array([9])}'],
  ['wrong digest', '{hash:new Uint8Array(32)}'], ['wrong algorithm', "{algorithm:'1.3.14.3.2.26'}"],
  ['wrong content type', "{contentType:'1.2.3.5'}"], ['missing signature', '{signature:false}'],
  ['invalid calendar date', "{time:'20260231080000Z'}"]
]) {
  test(`TSA rejects ${name}`, async () => {
    const c = await fixture();
    assert.throws(() => c.eval(`parseTimestampResponse(responseFixture(${options}),expectedHash,expectedNonce)`));
  });
}

test('structurally valid token is explicitly not cryptographically verified', async () => {
  const c = await fixture();
  const result = c.eval('parseTimestampResponse(responseFixture(),expectedHash,expectedNonce,"1.2.3.4")');
  assert.equal(result.verification, 'not-verified');
  assert.throws(() => c.eval('parseTimestampResponse(responseFixture(),expectedHash,expectedNonce,"1.2.3.5")'));
});

test('TSA rejects truncated DER at every boundary and trailing data', async () => {
  const c = await fixture();
  const bytes = c.eval('responseFixture()');
  for (let i = 0; i < bytes.length; i++) {
    c.input = bytes.slice(0, i);
    assert.throws(() => c.eval('parseTimestampResponse(input,expectedHash,expectedNonce)'));
  }
  c.input = new Uint8Array([...bytes, 0]);
  assert.throws(() => c.eval('parseTimestampResponse(input,expectedHash,expectedNonce)'));
  for (const malformed of [[48,128], [48,130,255], [48,129,1,0], [48,255]]) {
    assert.throws(() => c.readTlv(new Uint8Array(malformed)));
  }
});

test('OID encoding supports multibyte root subidentifier and large arcs', async () => {
  const c = await fixture();
  for (const oid of ['2.999.4294967296.1', '1.2.840.113549.1.9.16.1.4', '0.39.0']) {
    assert.equal(c.decodeOid(c.readTlv(c.encodeOid(oid)).value), oid);
  }
  for (const oid of ['3.1', '1.40.1', '1.-1', '1.2.', '1.02.3']) assert.throws(() => c.encodeOid(oid));
});

test('real OpenSSL timestamp round trip verifies manifest and detects tampering', async () => {
  const c = await fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-tsa-'));
  const openssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const data = Buffer.from('abc123  capture.report.txt\n');
    const digest = await c.sha256Bytes(data);
    const { request, nonce } = c.buildTimestampRequest(digest, '1.2.3.4');
    fs.writeFileSync(path.join(dir, 'manifest.sha256'), data);
    fs.writeFileSync(path.join(dir, 'request.tsq'), request);
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'key.pem', '-out', 'cert.pem', '-days', '1', '-subj', '/CN=Local test TSA', '-addext', 'extendedKeyUsage=critical,timeStamping', '-addext', 'keyUsage=critical,digitalSignature');
    fs.writeFileSync(path.join(dir, 'serial'), '01');
    fs.writeFileSync(path.join(dir, 'tsa.cnf'), `[tsa]\ndefault_tsa = tsa_config\n[tsa_config]\nserial = serial\nsigner_cert = cert.pem\nsigner_key = key.pem\nsigner_digest = sha256\ndefault_policy = 1.2.3.4\ndigests = sha256\naccuracy = secs:1\nordering = no\ntsa_name = yes\ness_cert_id_chain = no\ness_cert_id_alg = sha256\n`);
    openssl('ts', '-reply', '-config', 'tsa.cnf', '-queryfile', 'request.tsq', '-out', 'reply.tsr');
    const response = new Uint8Array(fs.readFileSync(path.join(dir, 'reply.tsr')));
    const result = c.parseTimestampResponse(response, digest, nonce, '1.2.3.4');
    assert.equal(result.status, 'granted');
    assert.equal(result.verification, 'not-verified');
    const args = ['ts', '-verify', '-data', 'manifest.sha256', '-in', 'reply.tsr', '-CAfile', 'cert.pem'];
    assert.match(openssl(...args).toString(), /Verification: OK/);
    fs.appendFileSync(path.join(dir, 'manifest.sha256'), 'tampered');
    assert.throws(() => openssl(...args));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rejection reports statusString and failInfo from the TSA', async () => {
  const c = await fixture();
  const msg = c.eval(`
    const text = der(0x30, der(0x0c, new TextEncoder().encode('policy not\u202e allowed')));
    const fail = der(0x03, [0x00, 0x00, 0x01]); // bit 15: unacceptedPolicy
    const resp = der(0x30, der(0x30, concat(der(2, [2]), text, fail)));
    try { parseTimestampResponse(resp, expectedHash, expectedNonce); 'no error' } catch (e) { e.code + '|' + e.message }
  `);
  assert.match(msg, /^tsa\.rejected\|/);
  assert.match(msg, /rejection/);
  assert.match(msg, /policy not  allowed; unacceptedPolicy/);
});
