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
  const parts = oid.split(".").map(Number);
  if (parts.length < 2 || parts.some((p) => !Number.isInteger(p) || p < 0)) {
    throw i18nError("tsa.badOid", { oid });
  }
  const bytes = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    const chunk = [p & 0x7f];
    let v = p >>> 7;
    while (v > 0) { chunk.unshift(0x80 | (v & 0x7f)); v >>>= 7; }
    bytes.push(...chunk);
  }
  return der(0x06, bytes);
}

function decodeOid(bytes) {
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let v = 0;
  for (const b of bytes.slice(1)) {
    v = (v << 7) | (b & 0x7f);
    if (!(b & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join(".");
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
  const tag = bytes[offset];
  let len = bytes[offset + 1];
  let pos = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0) throw new Error("Indefinite length not supported");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[pos++];
  }
  return { tag, start: pos, end: pos + len, value: bytes.subarray(pos, pos + len) };
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
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ""}Z`;
}

const PKI_STATUS = ["granted", "grantedWithMods", "rejection", "waiting", "revocationWarning", "revocationNotification"];

function parseTimestampResponse(bytes, expectedHash, expectedNonce) {
  const resp = readTlv(bytes);
  const [statusInfo, token] = children(resp);
  const statusParts = children(statusInfo);
  const status = statusParts[0].value[0];
  if (status !== 0 && status !== 1) {
    const text = statusParts[1]
      ? children(statusParts[1]).map((c) => new TextDecoder().decode(c.value)).join(" ")
      : "";
    throw i18nError("tsa.rejected", { status: PKI_STATUS[status] || status, text: text ? ": " + text : "" });
  }
  if (!token) throw i18nError("tsa.noToken");

  // ContentInfo -> [0] SignedData -> encapContentInfo -> [0] OCTET STRING -> TSTInfo
  const signedData = readTlv(children(token)[1].value);
  const encap = children(signedData).find((c, i) => i > 0 && c.tag === 0x30);
  const eContent = readTlv(children(encap)[1].value);
  const tstInfo = readTlv(eContent.value);
  const f = children(tstInfo);
  const policy = decodeOid(f[1].value);
  const imprintHash = children(f[2])[1].value;
  const serial = toHex(f[3].value);
  const genTime = parseGeneralizedTime(f[4].value);

  if (toHex(imprintHash) !== toHex(expectedHash)) {
    throw i18nError("tsa.mismatch");
  }
  const nonceField = f.find((c, i) => i > 4 && c.tag === 0x02);
  if (nonceField && expectedNonce) {
    const got = toHex(nonceField.value).replace(/^0+/, "");
    if (got !== toHex(expectedNonce).replace(/^0+/, "")) {
      throw i18nError("tsa.nonce");
    }
  }
  return { status: PKI_STATUS[status], genTime, serial, policy };
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
    info = parseTimestampResponse(tsr, hash, nonce);
  } catch (err) {
    if (["tsa.rejected", "tsa.noToken", "tsa.mismatch", "tsa.nonce"].includes(err.code)) throw err;
    throw i18nError("tsa.invalid", { error: err.message });
  }
  return { tsr, ...info, url: cfg.url };
}
