const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { context, ROOT } = require('./helpers.cjs');

// Token reali (hash 0x07 × 32), raccolti dai servizi preimpostati.
const REAL = {
  digicert: { anchor: 'DigiCert Trusted Root G4', signer: /DigiCert .*Timestamp/ },
  sectigo: { anchor: 'Sectigo Public Time Stamping Root R46', signer: /Sectigo Public Time Stamping Signer/ },
  freetsa: { anchor: 'Free TSA Root CA', signer: /freetsa/ } // firmatario ECDSA P-384
};
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', `${name}.tsr`)));
// Ora dichiarata nel token, letta dal parser strutturale.
function genTimeOf(c, tsr) {
  c.input = tsr;
  return c.eval(`(() => { try { parseTimestampResponse(input, new Uint8Array(32).fill(7), new Uint8Array([1])); } catch (e) {}
    const tok = children(onlyTlv(input, 0x30))[1];
    const sd = children(onlyTlv(expectTag(children(tok)[1], 0xa0).value, 0x30));
    const tst = children(onlyTlv(onlyTlv(expectTag(children(sd[2])[1], 0xa0).value, 4).value, 0x30));
    return parseGeneralizedTime(tst[4].value); })()`);
}

for (const [name, expected] of Object.entries(REAL)) {
  test(`real ${name} token: signature and chain verified`, async () => {
    const c = await context();
    const tsr = fixture(name);
    const r = await c.verifyTimestampSignature(tsr, genTimeOf(c, tsr));
    assert.equal(r.verification, 'verified', r.reason);
    assert.equal(r.anchor, expected.anchor);
    assert.match(r.signer, expected.signer);
    assert.equal(r.anchorSource, 'bundled');
  });

  test(`real ${name} token: any altered byte in TSTInfo, attributes or signature is detected`, async () => {
    const c = await context();
    const tsr = fixture(name);
    const time = genTimeOf(c, tsr);
    // Altera un bit nelle parti coperte dalla firma (TSTInfo, attributi
    // firmati, firma): nessuna alterazione può dare "verified".
    c.input = tsr;
    const ranges = c.eval(`(() => {
      const off = (n) => n.raw.byteOffset - input.byteOffset;
      const tok = children(onlyTlv(input, 0x30))[1];
      const sd = children(onlyTlv(expectTag(children(tok)[1], 0xa0).value, 0x30));
      const tst = onlyTlv(expectTag(children(sd[2])[1], 0xa0).value, 4);
      const si = children(children(sd[sd.length - 1])[0]);
      return [tst, si[3], si[5]].map((n) => [off(n), off(n) + n.raw.length]);
    })()`);
    const positions = ranges.flatMap(([a, b]) => [a + 2, Math.floor((a + b) / 2), b - 1,
      ...Array.from({ length: 12 }, (_, k) => a + Math.floor(((b - a) * (k + 1)) / 13))]);
    for (const i of positions) {
      const t = tsr.slice();
      t[i] ^= 0x01;
      const r = await c.verifyTimestampSignature(t, time);
      assert.notEqual(r.verification, 'verified', `byte ${i}`);
    }
  });

  test(`real ${name} token: without bundled roots the chain is untrusted`, async () => {
    const c = await context();
    const tsr = fixture(name);
    c.eval('TSA_TRUSTED_ROOTS.length = 0');
    const r = await c.verifyTimestampSignature(tsr, genTimeOf(c, tsr));
    assert.equal(r.verification, 'untrusted');
  });

  test(`real ${name} token: a time outside certificate validity is untrusted`, async () => {
    const c = await context();
    const r = await c.verifyTimestampSignature(fixture(name), '1999-01-01T00:00:00Z');
    assert.equal(r.verification, 'untrusted');
    assert.match(r.reason, /not valid at the stated time/);
  });
}

test('custom CA from options makes a private TSA verified; a missing CA leaves it untrusted', async () => {
  const c = await context();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-tsaverify-'));
  const openssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    // Piccola PKI: radice → TSA con EKU timeStamping.
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2', '-subj', '/CN=Test Root CA',
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
    openssl('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'tsa.key', '-out', 'tsa.csr', '-subj', '/CN=Test TSA');
    fs.writeFileSync(path.join(dir, 'ext.cnf'), 'extendedKeyUsage=critical,timeStamping\nkeyUsage=critical,digitalSignature\nbasicConstraints=CA:FALSE\n');
    openssl('x509', '-req', '-in', 'tsa.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'tsa.pem', '-days', '1', '-extfile', 'ext.cnf');
    fs.writeFileSync(path.join(dir, 'serial'), '01');
    fs.writeFileSync(path.join(dir, 'tsa.cnf'), `[tsa]\ndefault_tsa = t\n[t]\nserial = serial\nsigner_cert = tsa.pem\ncerts = ca.pem\nsigner_key = tsa.key\nsigner_digest = sha256\ndefault_policy = 1.2.3.4\ndigests = sha256\ness_cert_id_alg = sha256\n`);
    const digest = new Uint8Array(32).fill(3);
    const { request, nonce } = c.buildTimestampRequest(digest);
    fs.writeFileSync(path.join(dir, 'q.tsq'), request);
    openssl('ts', '-reply', '-config', 'tsa.cnf', '-queryfile', 'q.tsq', '-out', 'r.tsr');
    const tsr = new Uint8Array(fs.readFileSync(path.join(dir, 'r.tsr')));
    const info = c.parseTimestampResponse(tsr, digest, nonce);
    const caPem = fs.readFileSync(path.join(dir, 'ca.pem'), 'utf8');

    const trusted = await c.verifyTimestampSignature(tsr, info.genTime, caPem);
    assert.equal(trusted.verification, 'verified', trusted.reason);
    assert.equal(trusted.anchorSource, 'custom');
    assert.equal(trusted.signer, 'Test TSA');

    const untrusted = await c.verifyTimestampSignature(tsr, info.genTime, '');
    assert.equal(untrusted.verification, 'untrusted');
    assert.match(untrusted.reason, /Test Root CA/);

    // Il certificato della TSA non è una CA: usato come "radice" non basta
    // a validare un token firmato da un'altra chiave.
    assert.equal(c.isValidCaPem(caPem), true);
    assert.equal(c.isValidCaPem(''), true);
    assert.equal(c.isValidCaPem('garbage'), false);
    assert.equal(c.isValidCaPem(caPem + '\nextra text'), false);
    assert.equal(c.isValidCaPem('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

