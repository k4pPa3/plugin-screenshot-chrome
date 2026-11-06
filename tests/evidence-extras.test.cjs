const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { context } = require('./helpers.cjs');
const text = (bytes) => new TextDecoder().decode(bytes);
const sha256 = async (bytes) => Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');

const LEAF = Buffer.alloc(150, 7).toString('base64');
const ROOT_CERT = Buffer.alloc(40, 9).toString('base64');

// Esegue run() con una cattura simulata; restituisce i file del pacchetto e i download.
async function bundle(features, shotExtra = {}) {
  const c = await context();
  c.testFeatures = features;
  c.testShot = shotExtra;
  c.chrome.runtime.getPlatformInfo = async () => ({ os: 'win', arch: 'x86-64' });
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png',
      features: {...DEFAULT_SETTINGS.features, jsonReport:true, ...testFeatures}});
    capture = async () => ({date:new Date('2026-11-06T08:00:00Z'),url:'https://example.test/',title:'t',
      width:800,height:600,image:new Uint8Array([1,2,3]),network:null,networkError:null,...testShot});
    globalThis.outputs = [];
    globalThis.downloads = [];
    const originalZip = makeZip;
    makeZip = (files, date) => { globalThis.outputs = files; globalThis.zipBytes = originalZip(files, date); return globalThis.zipBytes; };
    download = async (bytes, mime, name) => { globalThis.downloads.push({ name, bytes }); };
  `);
  await c.run({ title: 't', url: 'https://example.test/' });
  // Con lo ZIP i file sono quelli archiviati, altrimenti quelli scaricati.
  return { c, files: features.zip ? c.outputs : c.downloads, downloads: c.downloads };
}
const find = (files, suffix) => files.find((f) => f.name.endsWith(suffix));

test('visible text and links are saved and hashed in the manifest', async () => {
  const { files } = await bundle({ text: true }, {
    text: { text: 'Titolo\nCorpo', links: ['https://example.test/a', 'https://user:secret@other.test/b'], totalLinks: 2 }
  });
  const file = find(files, '.text.txt');
  assert.ok(file, 'text file present');
  const body = text(file.bytes);
  assert.match(body, /Titolo\nCorpo/);
  assert.match(body, /^https:\/\/example\.test\/a$/m);
  assert.ok(!body.includes('secret'), 'password in link URL is redacted');
  const manifest = text(find(files, '.manifest.sha256').bytes);
  assert.ok(manifest.includes(`${await sha256(file.bytes)}  ${file.name}`));
  const json = JSON.parse(text(find(files, '.report.json').bytes));
  assert.ok(json.files.some((f) => f.type === 'text'));
});

test('text file notes links beyond the limit', async () => {
  const { c } = await bundle({});
  const out = c.buildTextFile({ url: 'https://example.test/', date: new Date(0) },
    { text: '', links: ['https://example.test/1'], totalLinks: 5 });
  assert.ok(out.includes(c.t('text.moreLinks', { n: 4 })));
});

test('derToPem wraps base64 at 64 columns with PEM armour', async () => {
  const { c } = await bundle({});
  const pem = c.derToPem(LEAF);
  const lines = pem.trim().split('\n');
  assert.equal(lines[0], '-----BEGIN CERTIFICATE-----');
  assert.equal(lines.at(-1), '-----END CERTIFICATE-----');
  for (const l of lines.slice(1, -1)) assert.ok(l.length <= 64);
  assert.equal(lines.slice(1, -1).join(''), LEAF);
});

test('TLS certificate chain is saved as PEM evidence and kept out of the JSON report', async () => {
  const c0 = await context();
  const chainPem = c0.derToPem(LEAF) + c0.derToPem(ROOT_CERT);
  const network = { redirects: [], document: { url: 'https://example.test/', status: 200, headers: {} },
    certificate: { sha256: 'AA:BB', chainLength: 2 } };
  const { files } = await bundle({ network: true }, { network, chainPem });
  const pem = find(files, '.cert.pem');
  assert.ok(pem, 'pem file present');
  assert.equal(text(pem.bytes), chainPem);
  assert.equal((text(pem.bytes).match(/BEGIN CERTIFICATE/g) || []).length, 2);
  assert.ok(text(find(files, '.manifest.sha256').bytes).includes(pem.name));
  assert.ok(text(find(files, '.report.txt').bytes).includes(pem.name));
  const json = text(find(files, '.report.json').bytes);
  assert.ok(!json.includes('BEGIN CERTIFICATE'));
  assert.equal(JSON.parse(json).network.certificate.file, pem.name);
});

test('operating system is reported in the environment', async () => {
  const { c, files } = await bundle({});
  const json = JSON.parse(text(find(files, '.report.json').bytes));
  assert.equal(json.environment.os, 'Windows x86-64');
  assert.ok(text(find(files, '.report.txt').bytes).includes(c.t('row.os')));
});

test('a text extraction failure is a warning, not a failed acquisition', async () => {
  const c = await context();
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png', features: {...DEFAULT_SETTINGS.features, text:true}});
    capture = async () => ({date:new Date('2026-11-06T08:00:00Z'),url:'https://example.test/',title:'t',
      width:800,height:600,image:new Uint8Array([1,2,3]),network:null,networkError:null,textError:'timeout'});
    globalThis.names = []; download = async (b, m, name) => { globalThis.names.push(name); };
  `);
  const result = await c.run({ title: 't', url: 'https://example.test/' });
  assert.ok(result.warnings.some((w) => c.tm(w).includes('timeout')));
  assert.ok(c.names.some((n) => n.endsWith('.png')));
  assert.ok(!c.names.some((n) => n.endsWith('.text.txt')));
});

test('a failed ZIP checksum download is a warning; the ZIP stays saved', async () => {
  const c = await context();
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png', features: {...DEFAULT_SETTINGS.features, zip:true}});
    capture = async () => ({date:new Date('2026-11-06T08:00:00Z'),url:'https://example.test/',title:'t',
      width:800,height:600,image:new Uint8Array([1,2,3]),network:null,networkError:null});
    globalThis.names = [];
    download = async (b, m, name) => { if (name.endsWith('.zip.sha256')) throw new Error('disk full'); globalThis.names.push(name); };
  `);
  const result = await c.run({ title: 't', url: 'https://example.test/' });
  assert.ok(result.zipHash);
  assert.ok(c.names.some((n) => n.endsWith('.zip')));
  assert.ok(result.warnings.some((w) => c.tm(w).includes('disk full')));
});

test('ZIP checksum is saved next to the archive in sha256sum format', async () => {
  const { c, downloads } = await bundle({ zip: true });
  const zip = downloads.find((d) => d.name.endsWith('.zip'));
  const side = downloads.find((d) => d.name.endsWith('.zip.sha256'));
  assert.ok(zip && side);
  assert.equal(text(side.bytes), `${await sha256(c.zipBytes)}  ${zip.name}\n`);
});
