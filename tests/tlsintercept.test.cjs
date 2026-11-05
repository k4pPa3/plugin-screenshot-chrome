const test = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./helpers.cjs');

const NOW = Date.parse('2026-11-05T07:32:59Z');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('NordVPN Threat Protection certificate is flagged as likely interception', async () => {
  const c = await context();
  const r = plain(c.detectTlsInterception({
    issuer: 'NordVPN S.A. -ThreatProtection', validFrom: '2026-11-05T07:00:25.000Z',
    sctCount: 0, ctCompliance: 'not-compliant'
  }, NOW));
  assert.equal(r.status, 'likely');
  assert.deepEqual(r.signals, ['known-issuer', 'no-sct', 'fresh-cert']);
  assert.equal(r.product, 'NordVPN Threat Protection');
});

test('public certificate with SCTs is not flagged, even if freshly issued', async () => {
  const c = await context();
  for (const sec of [
    { issuer: 'R11', validFrom: '2026-11-05T06:00:00Z', sctCount: 2, ctCompliance: 'compliant' },
    { issuer: 'DigiCert Global G2 TLS RSA SHA256 2020 CA1', validFrom: '2026-01-01T00:00:00Z', sctCount: 3, ctCompliance: 'compliant' },
    { issuer: 'Amazon RSA 2048 M02', validFrom: '2026-06-01T00:00:00Z', sctCount: null, ctCompliance: null }
  ]) assert.equal(c.detectTlsInterception(sec, NOW).status, 'none', sec.issuer);
  assert.equal(c.detectTlsInterception(null, NOW).status, 'none');
});

test('unknown local CA without SCTs is suspected, likely when freshly minted', async () => {
  const c = await context();
  const old = { issuer: 'Corp Root CA', validFrom: '2025-01-01T00:00:00Z', sctCount: 0, ctCompliance: 'unknown' };
  assert.equal(c.detectTlsInterception(old, NOW).status, 'suspected');
  assert.equal(c.detectTlsInterception({ ...old, validFrom: '2026-11-05T05:00:00Z' }, NOW).status, 'likely');
});

test('report rows and every locale describe the interception', async () => {
  const c = await context();
  const net = {
    redirects: [],
    document: { url: 'https://x.test/', status: 200, security: {
      protocol: 'TLS 1.3', cipher: 'AES_256_GCM', subjectName: 'x.test', issuer: 'NordVPN S.A. -ThreatProtection',
      validFrom: 'a', validTo: 'b', sctCount: 0, ctCompliance: 'not-compliant' } },
    tlsInterception: { status: 'likely', signals: ['known-issuer', 'no-sct'], issuer: 'NordVPN', product: 'NordVPN Threat Protection', userOverride: true }
  };
  for (const locale of ['en', 'it', 'fr', 'es']) {
    c.setLanguage(locale);
    const rows = c.networkRows(net, null);
    const row = rows.find(([label]) => label === c.t('row.tlsInterception'));
    assert.ok(row && row[1].includes('NordVPN Threat Protection') && row[1].includes(c.t('tls.override')), locale);
    for (const key of ['err.tlsInterception', 'warn.tlsInterception', 'note.tlsClean', 'cover.note.tlsInterception',
      'popup.tls.title', 'popup.tls.titleSuspected', 'popup.tls.body', 'popup.tls.retry', 'popup.tls.override',
      'options.advanced.tlsCheck', 'options.advanced.tlsCheck.help', 'tls.suspected', 'tls.none', 'row.ct', 'ct.value']) {
      assert.ok(c.eval(`I18N.${locale}[${JSON.stringify(key)}]`), `${locale} ${key}`);
    }
  }
});

test('tlsCheck is on by default', async () => {
  const c = await context();
  assert.equal(c.eval('DEFAULT_SETTINGS.advanced.tlsCheck'), true);
});
