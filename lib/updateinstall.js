// Solo installazioni da cartella: pacchetto verificato → backup → sostituzione.
// Nessuno script scaricato viene valutato. Il manifest viene scritto per ultimo.
const UPDATE_MAX_EXPANDED = 64 * 1024 * 1024;
const UPDATE_MAX_FILES = 256;

function safeUpdatePath(name) {
  if (typeof name !== "string" || name.length > 240 || /[\\:\x00-\x1f\x7f]/.test(name)) return false;
  const parts = name.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) return false;
  return /^(manifest\.json|background\.js|(?:popup|options|verify)\.(?:html|js)|ui\.css)$/.test(name)
    || /^lib\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.js$/.test(name)
    || /^_locales\/[a-zA-Z_-]+\/messages\.json$/.test(name)
    || /^icons\/[a-zA-Z0-9_-]+\.png$/.test(name);
}

function compareUpdateVersions(a, b) {
  const pattern = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){2,3}$/;
  if (!pattern.test(a) || !pattern.test(b)) throw i18nError("updates.invalidPackage");
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let index = 0; index < 4; index++) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}

async function inflateUpdateBytes(bytes, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw i18nError("updates.invalidPackage");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

async function readUpdateArchive(bytes, update) {
  const fail = () => { throw i18nError("updates.invalidPackage"); };
  if (bytes.length !== update.size || bytes.length > UPDATE_MAX_BYTES
    || await sha256Hex(bytes) !== update.digest) throw i18nError("updates.integrityError");
  try {
    if (bytes.length < 22) fail();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // I pacchetti di release non hanno commenti ZIP né directory esplicite.
    const end = bytes.length - 22;
    if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 20, true)
      || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail();
    const count = view.getUint16(end + 10, true);
    const centralSize = view.getUint32(end + 12, true), centralStart = view.getUint32(end + 16, true);
    if (!count || count > UPDATE_MAX_FILES || count !== view.getUint16(end + 8, true)
      || centralStart + centralSize !== end) fail();
    const files = [], seen = new Set();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let cursor = centralStart, localEnd = 0, expanded = 0;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) fail();
      const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
      const crc = view.getUint32(cursor + 16, true), size = view.getUint32(cursor + 20, true), unpacked = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true);
      const mode = view.getUint32(cursor + 38, true) >>> 16;
      const start = view.getUint32(cursor + 42, true), next = cursor + 46 + nameLength + extra + comment;
      if (next > end || !nameLength || (flags & ~0x0800) || ![0, 8].includes(method)
        || view.getUint16(cursor + 34, true) || (mode & 0xf000) === 0xa000
        || unpacked > UPDATE_MAX_BYTES || (expanded += unpacked) > UPDATE_MAX_EXPANDED) fail();
      const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      if (!safeUpdatePath(name) || seen.has(name.toLowerCase())) fail();
      seen.add(name.toLowerCase());
      if (start !== localEnd || start + 30 > centralStart || view.getUint32(start, true) !== 0x04034b50
        || view.getUint16(start + 6, true) !== flags || view.getUint16(start + 8, true) !== method
        || view.getUint32(start + 14, true) !== crc || view.getUint32(start + 18, true) !== size
        || view.getUint32(start + 22, true) !== unpacked || view.getUint16(start + 26, true) !== nameLength) fail();
      const dataStart = start + 30 + nameLength + view.getUint16(start + 28, true);
      localEnd = dataStart + size;
      if (localEnd > centralStart || decoder.decode(bytes.subarray(start + 30, start + 30 + nameLength)) !== name) fail();
      const packed = bytes.subarray(dataStart, localEnd);
      const content = method === 0 ? packed : await inflateUpdateBytes(packed, unpacked);
      if (content.length !== unpacked || crc32(content) !== crc) fail();
      files.push({ name, bytes: content, sha256: await sha256Hex(content) });
      cursor = next;
    }
    if (cursor !== end || localEnd !== centralStart) fail();
    for (const required of ["manifest.json", "background.js", "popup.html", "popup.js", "options.html", "options.js", "ui.css"]) {
      if (!files.some(file => file.name === required)) fail();
    }
    const manifest = JSON.parse(decoder.decode(files.find(file => file.name === "manifest.json").bytes));
    if (manifest.name !== "Forensic Web Capture" || manifest.manifest_version !== 3
      || manifest.background?.service_worker !== "background.js" || manifest.version !== update.version) fail();
    return { files, manifest };
  } catch (error) {
    if (error.code === "updates.invalidPackage") throw error;
    fail();
  }
}

async function updateFileHandle(directory, name, create = false) {
  const parts = name.split("/");
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create });
  return directory.getFileHandle(parts.at(-1), { create });
}

async function writeUpdateFile(directory, name, bytes) {
  const handle = await updateFileHandle(directory, name, true);
  const stream = await handle.createWritable();
  try { await stream.write(bytes); await stream.close(); }
  catch (error) { try { await stream.abort(); } catch (_) {} throw error; }
  const saved = await handle.getFile();
  if (saved.size !== bytes.length || await sha256Hex(await saved.arrayBuffer()) !== await sha256Hex(bytes)) {
    throw i18nError("updates.integrityError");
  }
}

async function installUpdateFolder(directory, archive, expectedInstalledVersion = "") {
  let current;
  try {
    const file = await (await directory.getFileHandle("manifest.json")).getFile();
    if (file.size > 1024 * 1024) throw new Error("manifest too large");
    current = JSON.parse(await file.text());
    if (current.name !== archive.manifest.name || current.manifest_version !== 3
      || current.background?.service_worker !== "background.js"
      || (expectedInstalledVersion && current.version !== expectedInstalledVersion)
      || compareUpdateVersions(current.version, archive.manifest.version) > 0) throw new Error("different installation");
  } catch (_) { throw i18nError("updates.wrongFolder"); }

  // Leggi tutte le copie prima di modificare qualsiasi file dell'installazione.
  const previous = new Map();
  let backupSize = 0;
  for (const file of archive.files) {
    try {
      const old = await (await updateFileHandle(directory, file.name)).getFile();
      backupSize += old.size;
      if (backupSize > UPDATE_MAX_EXPANDED) throw i18nError("updates.invalidPackage");
      previous.set(file.name, new Uint8Array(await old.arrayBuffer()));
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
      previous.set(file.name, null);
    }
  }
  const backup = `.fwc-backup-${current.version}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const backupDirectory = await directory.getDirectoryHandle(backup, { create: true });
  for (const [name, bytes] of previous) if (bytes !== null) await writeUpdateFile(backupDirectory, name, bytes);

  const written = [];
  try {
    const ordered = [...archive.files].sort((a, b) => Number(a.name === "manifest.json") - Number(b.name === "manifest.json"));
    for (const file of ordered) {
      written.push(file.name);
      await writeUpdateFile(directory, file.name, file.bytes);
    }
  } catch (_) {
    let recoveryFailed = false;
    for (const name of written.reverse()) {
      try {
        const old = previous.get(name);
        if (old !== null) await writeUpdateFile(directory, name, old);
        else {
          const parts = name.split("/");
          let parent = directory;
          for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part);
          await parent.removeEntry(parts.at(-1));
        }
      } catch (_) { recoveryFailed = true; }
    }
    throw i18nError(recoveryFailed ? "updates.recoveryFailed" : "updates.installError", { backup });
  }
  return { version: archive.manifest.version, folder: directory.name, backup, files: archive.files.length };
}
