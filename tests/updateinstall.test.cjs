const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { context, ROOT } = require('./helpers.cjs');

async function installerContext() {
  const c = await context();
  Object.assign(c, { Blob, DecompressionStream });
  for (const file of ['lib/updates.js', 'lib/updateinstall.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c, { filename: file });
  }
  return c;
}
function manifest(version = '1.8.3') {
  return { name: 'Forensic Web Capture', version, manifest_version: 3, background: { service_worker: 'background.js' } };
}
async function archiveFixture(c, extra = [], version = '1.8.3') {
  const files = ['background.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css']
    .map(name => ({ name, bytes: Buffer.from(`new ${name}`) }));
  files.unshift({ name: 'manifest.json', bytes: Buffer.from(JSON.stringify(manifest(version))) });
  files.push(...extra);
  const bytes = c.makeZip(files, new Date());
  return { bytes, files, update: { version, size: bytes.length, digest: await c.sha256Hex(bytes) } };
}

// Models the File System Access API, including files created before close().
function directoryFixture(initial, fail = () => false) {
  const files = new Map(Object.entries(initial).map(([name, value]) => [name, Buffer.from(value)]));
  const writes = [];
  const missing = () => Object.assign(new Error('missing'), { name: 'NotFoundError' });
  const directory = (prefix = '') => ({
    kind: 'directory', name: prefix || 'extension',
    async getDirectoryHandle(name) { return directory(prefix + name + '/'); },
    async getFileHandle(name, { create = false } = {}) {
      const full = prefix + name;
      if (!files.has(full)) { if (!create) throw missing(); files.set(full, Buffer.alloc(0)); }
      return {
        async getFile() {
          const bytes = Buffer.from(files.get(full));
          return { size: bytes.length, text: async () => bytes.toString(),
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
        },
        async createWritable() {
          let next;
          return { async write(data) { next = Buffer.from(data); }, async abort() {},
            async close() { writes.push(full); if (fail(full)) throw new Error('write denied'); files.set(full, next); } };
        }
      };
    },
    async removeEntry(name) { files.delete(prefix + name); }
  });
  return { handle: directory(), files, writes };
}

test('updater parses stored and deflated release ZIPs with integrity checks', async () => {
  const c = await installerContext();
  const fixture = await archiveFixture(c, [{ name: 'lib/new.js', bytes: Buffer.from('new file') }]);
  const stored = await c.readUpdateArchive(fixture.bytes, fixture.update);
  assert.equal(stored.files.length, fixture.files.length);
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const compressed = execFileSync(python, ['-c', 'import io,sys,zipfile\na=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED) as z:\n for n in a.namelist(): z.writestr(n,a.read(n))\nsys.stdout.buffer.write(b.getvalue())'], { input: fixture.bytes });
  const deflated = await c.readUpdateArchive(compressed, { ...fixture.update, size: compressed.length, digest: await c.sha256Hex(compressed) });
  assert.equal(deflated.manifest.version, '1.8.3');
  assert.equal(new TextDecoder().decode(deflated.files.at(-1).bytes), 'new file');
});

test('untrusted hashes, path traversal, Windows paths and duplicate names fail before writing', async () => {
  const c = await installerContext();
  const good = await archiveFixture(c);
  await assert.rejects(c.readUpdateArchive(good.bytes, { ...good.update, digest: '00'.repeat(32) }), { code: 'updates.integrityError' });
  for (const name of ['../escape.js', '/background.js', 'lib/../../outside.js', 'lib\\outside.js', 'C:/outside.js', 'lib/NUL.js', 'lib/foo./a.js', 'manifest.json', 'Popup.js', 'secrets.txt']) {
    const bad = await archiveFixture(c, [{ name, bytes: Buffer.from('bad') }]);
    await assert.rejects(c.readUpdateArchive(bad.bytes, bad.update), { code: 'updates.invalidPackage' });
  }
});

test('corrupt CRCs, encrypted entries, symlinks and unreasonable expansion fail closed', async () => {
  const c = await installerContext();
  const fixture = await archiveFixture(c);
  for (const mutate of [
    (bytes, view, central) => { bytes[30 + 'manifest.json'.length] ^= 1; },
    (bytes, view, central) => view.setUint16(central + 8, 1, true),
    (bytes, view, central) => view.setUint32(central + 38, 0xa1ff0000, true),
    (bytes, view, central) => view.setUint32(central + 24, 0x7fffffff, true)
  ]) {
    const bytes = fixture.bytes.slice();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const central = view.getUint32(bytes.length - 6, true);
    mutate(bytes, view, central);
    await assert.rejects(c.readUpdateArchive(bytes, { ...fixture.update, digest: await c.sha256Hex(bytes) }), { code: 'updates.invalidPackage' });
  }
});

test('wrong package versions and truncated archives cannot be installed', async () => {
  const c = await installerContext();
  const fixture = await archiveFixture(c);
  await assert.rejects(c.readUpdateArchive(fixture.bytes, { ...fixture.update, version: '1.8.4' }), { code: 'updates.invalidPackage' });
  const bytes = fixture.bytes.slice(0, -1);
  await assert.rejects(c.readUpdateArchive(bytes, { ...fixture.update, size: bytes.length, digest: await c.sha256Hex(bytes) }), { code: 'updates.invalidPackage' });
});

test('installation backs up old files, preserves unrelated files and writes the manifest last', async () => {
  const c = await installerContext();
  const fixture = await archiveFixture(c, [{ name: 'lib/new.js', bytes: Buffer.from('new file') }]);
  const archive = await c.readUpdateArchive(fixture.bytes, fixture.update);
  const oldManifest = JSON.stringify(manifest('1.8.2'));
  const directory = directoryFixture({ 'manifest.json': oldManifest, 'popup.js': 'old popup', 'evidence.pdf': 'private evidence' });
  const result = await c.installUpdateFolder(directory.handle, archive, '1.8.2');
  assert.equal(result.version, '1.8.3');
  assert.equal(directory.files.get(`${result.backup}/manifest.json`).toString(), oldManifest);
  assert.equal(directory.files.get(`${result.backup}/popup.js`).toString(), 'old popup');
  assert.equal(directory.files.get('evidence.pdf').toString(), 'private evidence');
  assert.equal(directory.files.get('lib/new.js').toString(), 'new file');
  assert.equal(directory.writes.at(-1), 'manifest.json');
});

test('an unrelated folder, wrong installed version and downgrade make no writes', async () => {
  const c = await installerContext();
  const fixture = await archiveFixture(c);
  const archive = await c.readUpdateArchive(fixture.bytes, fixture.update);
  for (const current of [null, { ...manifest('1.8.2'), name: 'Other extension' }, manifest('2.0.0'), manifest('1.7.0')]) {
    const directory = directoryFixture(current ? { 'manifest.json': JSON.stringify(current) } : {});
    await assert.rejects(c.installUpdateFolder(directory.handle, archive, '1.8.2'), { code: 'updates.wrongFolder' });
    assert.deepEqual(directory.writes, []);
  }
});

test('a write failure restores originals and removes files introduced by the update', async () => {
  const c = await installerContext();
  const fixture = await archiveFixture(c);
  const archive = await c.readUpdateArchive(fixture.bytes, fixture.update);
  let failed = false;
  const initial = { 'manifest.json': JSON.stringify(manifest('1.8.2')), 'options.js': 'old code' };
  const directory = directoryFixture(initial, name => name === 'options.js' && !failed && (failed = true));
  await assert.rejects(c.installUpdateFolder(directory.handle, archive), { code: 'updates.installError' });
  for (const [name, value] of Object.entries(initial)) assert.equal(directory.files.get(name).toString(), value);
  assert.equal(directory.files.has('background.js'), false);
  assert.equal(directory.files.has('popup.js'), false);
});

test('a failed backup never overwrites installed files; failed rollback reports the backup location', async () => {
  const c = await installerContext();
  const fixture = await archiveFixture(c);
  const archive = await c.readUpdateArchive(fixture.bytes, fixture.update);
  const initial = { 'manifest.json': JSON.stringify(manifest('1.8.2')), 'options.js': 'old code' };
  const noBackup = directoryFixture(initial, name => name.startsWith('.fwc-backup-'));
  await assert.rejects(c.installUpdateFolder(noBackup.handle, archive));
  assert.equal(noBackup.files.get('options.js').toString(), 'old code');
  assert.equal(noBackup.files.has('background.js'), false);
  const noRecovery = directoryFixture(initial, name => name === 'options.js');
  await assert.rejects(c.installUpdateFolder(noRecovery.handle, archive), error => {
    assert.equal(error.code, 'updates.recoveryFailed');
    assert.match(error.params.backup, /^\.fwc-backup-1\.8\.2-/);
    return true;
  });
});
