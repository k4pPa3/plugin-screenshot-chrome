// Marca temporale RFC 3161: costruzione della richiesta DER e lettura
// della risposta del servizio (TSA).

const OID_SHA256 = "2.16.840.1.101.3.4.2.1";

function derLength(len) {
  if (len < 0x80) return [len];
  const out = [];
  while (len > 0) { out.unshift(len & 0xff); len >>= 8; }
  return [0x80 | out.length, ...out];
}

function der(tag, content) {
  const body = content instanceof Uint8Array ? content : new Uint8Array(content);
  const head = [tag, ...derLength(body.length)];
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
}

function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

function encodeOid(oid) {
  if (oid.length > 1024) throw i18nError("tsa.badOid", { oid: "too long" });
  if (!/^(0|1|2)(\.(0|[1-9][0-9]*))+$/.test(oid)) throw i18nError("tsa.badOid", { oid });
  const parts = oid.split(".").map(BigInt);
  if (parts[0] < 2n && parts[1] > 39n) throw i18nError("tsa.badOid", { oid });
  const bytes = [];
  for (let v of [parts[0] * 40n + parts[1], ...parts.slice(2)]) {
    const chunk = [Number(v & 127n)];
    while ((v >>= 7n) > 0n) chunk.unshift(128 | Number(v & 127n));
    bytes.push(...chunk);
  }
  return der(0x06, bytes);
}

function decodeOid(bytes) {
  if (bytes.length > 256) throw new Error("OID too large");
  const arcs = [];
  let v = 0n;
  let first = true;
  for (const b of bytes) {
    if (first && b === 0x80) throw new Error("Non-canonical OID");
    v = (v << 7n) | BigInt(b & 127);
    first = !(b & 128);
    if (first) { arcs.push(v); v = 0n; }
  }
  if (!arcs.length || !first) throw new Error("Truncated OID");
  const head = arcs.shift();
  const root = head < 40n ? 0n : head < 80n ? 1n : 2n;
  return [root, head - root * 40n, ...arcs].join(".");
}

function buildTimestampRequest(hash, policyOid) {
  const nonce = crypto.getRandomValues(new Uint8Array(8));
  nonce[0] = (nonce[0] & 0x7f) | 0x01; // intero positivo senza zeri iniziali
  const imprint = der(0x30, concat(
    der(0x30, concat(encodeOid(OID_SHA256), der(0x05, []))),
    der(0x04, hash)
  ));
  const body = concat(
    der(0x02, [1]), // version
    imprint,
    policyOid ? encodeOid(policyOid) : new Uint8Array(0),
    der(0x02, nonce),
    der(0x01, [0xff]) // certReq: includi il certificato della TSA
  );
  return { request: der(0x30, body), nonce };
}

// Lettore DER minimale.
function readTlv(bytes, offset = 0) {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error("Truncated DER header");
  const tag = bytes[offset];
  if ((tag & 31) === 31) throw new Error("Unsupported DER tag");
  let len = bytes[offset + 1];
  let pos = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (!n || n > 4 || pos + n > bytes.length || bytes[pos] === 0) throw new Error("Invalid DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[pos++];
    if (len < 128) throw new Error("Non-canonical DER length");
  }
  if (pos + len > bytes.length) throw new Error("Truncated DER value");
  return { tag, start: pos, end: pos + len, value: bytes.subarray(pos, pos + len) };
}

function expectTag(node, tag) {
  if (!node || node.tag !== tag) throw new Error("Unexpected DER structure");
  return node;
}

function onlyTlv(bytes, tag) {
  const node = expectTag(readTlv(bytes), tag);
  if (node.end !== bytes.length) throw new Error("Trailing DER data");
  return node;
}

function positiveInteger(node) {
  const bytes = expectTag(node, 0x02).value;
  if (!bytes.length || (bytes[0] & 128) || (bytes.length > 1 && bytes[0] === 0 && !(bytes[1] & 128))) {
    throw new Error("Invalid positive DER integer");
  }
  return toHex(bytes).replace(/^00/, "");
}

function children(tlv) {
  const out = [];
  let pos = 0;
  while (pos < tlv.value.length) {
    const c = readTlv(tlv.value, pos);
    out.push(c);
    pos = c.end;
  }
  return out;
}

function parseGeneralizedTime(bytes) {
  const s = String.fromCharCode(...bytes);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/);
  if (!m) throw new Error("Invalid TSA time");
  const value = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ""}Z`;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) throw new Error("Invalid TSA time");
  return value;
}

const PKI_STATUS = ["granted", "grantedWithMods", "rejection", "waiting", "revocationWarning", "revocationNotification"];

function parseTimestampResponse(bytes, expectedHash, expectedNonce, expectedPolicy = "") {
  const [statusInfo, token, ...extra] = children(onlyTlv(bytes, 0x30));
  if (extra.length) throw new Error("Unexpected timestamp response fields");
  const statusParts = children(expectTag(statusInfo, 0x30));
  const statusBytes = expectTag(statusParts[0], 0x02).value;
  if (statusBytes.length !== 1) throw new Error("Invalid PKI status");
  const status = statusBytes[0];
  if (status !== 0 && status !== 1) throw i18nError("tsa.rejected", { status: PKI_STATUS[status] || status, text: "" });
  if (!token) throw i18nError("tsa.noToken");

  const content = children(expectTag(token, 0x30));
  if (content.length !== 2 || decodeOid(expectTag(content[0], 6).value) !== "1.2.840.113549.1.7.2") throw new Error("Expected SignedData");
  const signedData = children(onlyTlv(expectTag(content[1], 0xa0).value, 0x30));
  expectTag(signedData[0], 2);
  expectTag(signedData[1], 0x31);
  // La presenza di una firma non implica la sua validità. La verifica della
  // firma e della catena di fiducia resta esplicitamente esterna (OpenSSL).
  const signers = children(expectTag(signedData[signedData.length - 1], 0x31));
  if (!signers.length) throw new Error("Missing signer information");
  for (const signer of signers) {
    const fields = children(expectTag(signer, 0x30));
    const algIndex = fields[3]?.tag === 0xa0 ? 4 : 3;
    expectTag(fields[algIndex], 0x30);
    if (!expectTag(fields[algIndex + 1], 4).value.length) throw new Error("Missing signature");
  }
  const encap = children(expectTag(signedData[2], 0x30));
  if (encap.length !== 2 || decodeOid(expectTag(encap[0], 6).value) !== "1.2.840.113549.1.9.16.1.4") throw new Error("Expected TSTInfo");
  const eContent = onlyTlv(expectTag(encap[1], 0xa0).value, 4);
  const f = children(onlyTlv(eContent.value, 0x30));
  if (positiveInteger(f[0]) !== "01") throw new Error("Unsupported TSTInfo version");
  const policy = decodeOid(expectTag(f[1], 6).value);
  if (expectedPolicy && policy !== expectedPolicy) throw new Error("TSA policy mismatch");
  const imprint = children(expectTag(f[2], 0x30));
  const algorithm = children(expectTag(imprint[0], 0x30));
  if (decodeOid(expectTag(algorithm[0], 6).value) !== OID_SHA256 || imprint.length !== 2) throw i18nError("tsa.mismatch");
  const imprintHash = expectTag(imprint[1], 4).value;
  if (imprintHash.length !== 32 || toHex(imprintHash) !== toHex(expectedHash)) throw i18nError("tsa.mismatch");
  const serial = positiveInteger(f[3]);
  const genTime = parseGeneralizedTime(expectTag(f[4], 0x18).value);
  const nonceFields = f.slice(5).filter((c) => c.tag === 2);
  if (!expectedNonce || nonceFields.length !== 1 || positiveInteger(nonceFields[0]) !== toHex(expectedNonce).replace(/^00/, "")) throw i18nError("tsa.nonce");
  return { status: PKI_STATUS[status], genTime, serial, policy, verification: "not-verified" };
}

const TSA_TIMEOUT_MS = 30000;
// Un token RFC 3161 pesa pochi KB: una risposta molto più grande è anomala.
const TSA_MAX_RESPONSE = 1024 * 1024;

async function readLimited(res, max) {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) throw i18nError("tsa.tooLarge");
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw i18nError("tsa.tooLarge");
    }
    chunks.push(value);
  }
  return concat(...chunks);
}

function tsaSendsSecrets(cfg) {
  return !!(cfg.username || cfg.password || cfg.headerName?.trim());
}

async function requestTimestamp(hash, cfg) {
  if (!cfg.url) throw i18nError("tsa.noUrl");
  if (tsaSendsSecrets(cfg) && new URL(cfg.url).protocol !== "https:") {
    throw i18nError("tsa.insecure");
  }
  const { request, nonce } = buildTimestampRequest(hash, cfg.policyOid?.trim());

  const headers = { "Content-Type": "application/timestamp-query" };
  if (cfg.username) {
    const raw = new TextEncoder().encode(`${cfg.username}:${cfg.password || ""}`);
    headers.Authorization = `Basic ${bytesToBase64(raw)}`;
  }
  if (cfg.headerName?.trim()) headers[cfg.headerName.trim()] = cfg.headerValue || "";

  let res;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: request,
      // Un redirect porterebbe credenziali e header a un altro indirizzo.
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(TSA_TIMEOUT_MS)
    });
  } catch (err) {
    if (err.name === "TimeoutError") throw i18nError("tsa.timeout", { seconds: TSA_TIMEOUT_MS / 1000 });
    throw i18nError("tsa.unreachable", { error: err.message });
  }
  if (!res.ok) throw i18nError("tsa.http", { status: res.status, text: res.statusText });
  const tsr = await readLimited(res, TSA_MAX_RESPONSE);

  let info;
  try {
    info = parseTimestampResponse(tsr, hash, nonce, cfg.policyOid?.trim());
  } catch (err) {
    if (["tsa.rejected", "tsa.noToken", "tsa.mismatch", "tsa.nonce"].includes(err.code)) throw err;
    throw i18nError("tsa.invalid", { error: err.message });
  }
  return { tsr, ...info, url: cfg.url };
}

