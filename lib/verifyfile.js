// Verifica locale: file selezionato → manifest immutabile → token firmato.
// La ricevuta JSON non è una fonte di fiducia e non viene usata.
const VERIFY_MAX_MANIFEST = 4 * 1024 * 1024;

function parseEvidenceManifest(bytes) {
  if (!bytes.length || bytes.length > VERIFY_MAX_MANIFEST) throw i18nError("verify.badManifest");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (_) { throw i18nError("verify.badManifest"); }
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([a-fA-F0-9]{64}) [ *]([^\x00-\x1f\x7f]+)$/.exec(line);
    if (!match || entries.has(match[2])) throw i18nError("verify.badManifest");
    entries.set(match[2], match[1].toLowerCase());
  }
  if (!entries.size) throw i18nError("verify.badManifest");
  return entries;
}

async function verifyTimestampFile({ fileBytes, filename, tsr, manifestBytes, caPem = "" }) {
  if (!tsr.length || tsr.length > TSA_MAX_RESPONSE) throw i18nError("tsa.tooLarge");
  if (!isValidCaPem(caPem)) throw i18nError("options.tsa.caPem.invalid");
  const fileHash = await sha256Hex(fileBytes);
  if (manifestBytes) {
    const entries = parseEvidenceManifest(manifestBytes);
    const expected = entries.get(filename);
    if (!expected) throw i18nError("verify.notListed", { file: filename });
    if (expected !== fileHash) throw i18nError("verify.fileMismatch", { file: filename });
  }
  const targetHash = await sha256Bytes(manifestBytes || fileBytes);
  const info = parseTimestampArtifact(tsr, targetHash);
  const signature = await verifyTimestampSignature(tsr, info.genTime, caPem);
  return { ...info, ...signature, filename, fileHash, targetHash: toHex(targetHash),
    binding: manifestBytes ? "manifest" : "direct" };
}
