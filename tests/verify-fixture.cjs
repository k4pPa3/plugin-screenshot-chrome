const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { context } = require('./helpers.cjs');

// A real signed acquisition, generated locally without contacting a TSA.
async function timestampFixture() {
  const c = await context();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwc-verify-'));
  const openssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2', '-subj', '/CN=Verification Test Root',
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
    openssl('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'tsa.key', '-out', 'tsa.csr', '-subj', '/CN=Verification Test TSA');
    fs.writeFileSync(path.join(dir, 'ext.cnf'), 'extendedKeyUsage=critical,timeStamping\nkeyUsage=critical,digitalSignature\nbasicConstraints=CA:FALSE\n');
    openssl('x509', '-req', '-in', 'tsa.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'tsa.pem', '-days', '1', '-extfile', 'ext.cnf');
    fs.writeFileSync(path.join(dir, 'serial'), '01');
    fs.writeFileSync(path.join(dir, 'tsa.cnf'), '[tsa]\ndefault_tsa = t\n[t]\nserial = serial\nsigner_cert = tsa.pem\ncerts = ca.pem\nsigner_key = tsa.key\nsigner_digest = sha256\ndefault_policy = 1.2.3.4\ndigests = sha256\ness_cert_id_alg = sha256\n');
    const fileBytes = Buffer.from('Previously captured evidence\n');
    const filename = 'capture_test.text.txt';
    const manifestBytes = Buffer.from(`${await c.sha256Hex(fileBytes)}  ${filename}\n`);
    const issue = async (data, noNonce = false) => {
      const { request } = c.buildTimestampRequest(await c.sha256Bytes(data));
      fs.writeFileSync(path.join(dir, 'request.tsq'), request);
      if (noNonce) openssl('ts', '-query', '-data', 'manifest.sha256', '-sha256', '-cert', '-no_nonce', '-out', 'request.tsq');
      openssl('ts', '-reply', '-config', 'tsa.cnf', '-queryfile', 'request.tsq', '-out', 'reply.tsr');
      return new Uint8Array(fs.readFileSync(path.join(dir, 'reply.tsr')));
    };
    fs.writeFileSync(path.join(dir, 'manifest.sha256'), manifestBytes);
    const tsr = await issue(manifestBytes);
    const directTsr = await issue(fileBytes);
    const noNonceTsr = await issue(manifestBytes, true);
    return { fileBytes, filename, manifestBytes, tsr, directTsr, noNonceTsr,
      caPem: fs.readFileSync(path.join(dir, 'ca.pem'), 'utf8') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = { timestampFixture };
