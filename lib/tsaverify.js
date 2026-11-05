// Verifica della firma di un token RFC 3161 (CMS SignedData) e della catena
// di certificati fino a una CA radice attendibile.
//
// Esiti:
//   verified    firma valida e catena fino a una radice attendibile
//   untrusted   firma valida, ma la catena non arriva a una radice attendibile
//   invalid     firma, impronta o certificato del firmatario non corrispondono
//   unsupported algoritmo o struttura non gestiti: verificare con OpenSSL
// La revoca (CRL/OCSP) NON viene controllata.
//
// Usa readTlv/children/expectTag/onlyTlv/decodeOid di lib/tsa.js e le radici
// di lib/tsaroots.js.

const OIDS = {
  signedData: "1.2.840.113549.1.7.2",
  tstInfo: "1.2.840.113549.1.9.16.1.4",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingCertificate: "1.2.840.113549.1.9.16.2.12",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  rsaEncryption: "1.2.840.113549.1.1.1",
  rsaPss: "1.2.840.113549.1.1.10",
  mgf1: "1.2.840.113549.1.1.8",
  ecPublicKey: "1.2.840.10045.2.1",
  timeStamping: "1.3.6.1.5.5.7.3.8",
  commonName: "2.5.4.3",
  organization: "2.5.4.10"
};

const HASHES = {
  "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512"
};

// Algoritmo di firma → schema e hash. rsaEncryption usa l'hash del digestAlgorithm.
const SIGNATURES = {
  "1.2.840.113549.1.1.5": { scheme: "rsa", hash: "SHA-1" },
  "1.2.840.113549.1.1.11": { scheme: "rsa", hash: "SHA-256" },
  "1.2.840.113549.1.1.12": { scheme: "rsa", hash: "SHA-384" },
  "1.2.840.113549.1.1.13": { scheme: "rsa", hash: "SHA-512" },
  "1.2.840.10045.4.3.2": { scheme: "ecdsa", hash: "SHA-256" },
  "1.2.840.10045.4.3.3": { scheme: "ecdsa", hash: "SHA-384" },
  "1.2.840.10045.4.3.4": { scheme: "ecdsa", hash: "SHA-512" }
};

const CURVES = {
  "1.2.840.10045.3.1.7": { name: "P-256", size: 32 },
  "1.3.132.0.34": { name: "P-384", size: 48 },
  "1.3.132.0.35": { name: "P-521", size: 66 }
};

// Estensioni comprese (o irrilevanti per la verifica): una critica non in
// elenco rende il certificato non utilizzabile (RFC 5280 §4.2).
const KNOWN_EXTENSIONS = new Set([
  "2.5.29.14", "2.5.29.15", "2.5.29.17", "2.5.29.19", "2.5.29.31", "2.5.29.32", "2.5.29.35", "2.5.29.37"
]);

const MAX_CHAIN = 8;

class VerifyError extends Error {
  constructor(outcome, reason) { super(reason); this.outcome = outcome; }
}
const invalid = (reason) => new VerifyError("invalid", reason);
const unsupported = (reason) => new VerifyError("unsupported", reason);

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function oidOf(node) {
  return decodeOid(expectTag(node, 0x06).value);
}

function parseTime(node) {
  const s = String.fromCharCode(...node.value);
  let m;
  if (node.tag === 0x17 && (m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/))) {
    const yy = Number(m[1]);
    return Date.UTC(yy < 50 ? 2000 + yy : 1900 + yy, m[2] - 1, m[3], m[4], m[5], m[6]);
  }
  if (node.tag === 0x18 && (m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/))) {
    return Date.UTC(Number(m[1]), m[2] - 1, m[3], m[4], m[5], m[6]);
  }
  throw new Error("Invalid certificate time");
}

function decodeString(node) {
  const v = node.value;
  if (node.tag === 0x1e) { // BMPString
    let s = "";
    for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1]);
    return s;
  }
  if (node.tag === 0x0c) return new TextDecoder().decode(v);
  return String.fromCharCode(...v);
}

// Nome leggibile (CN, altrimenti O) da un Name X.501; testo non affidabile,
// ripulito e limitato prima di finire in report e interfaccia.
function displayName(nameNode) {
  const found = {};
  for (const rdn of children(nameNode)) {
    for (const atv of children(rdn)) {
      const [type, value] = children(atv);
      const oid = oidOf(type);
      if (oid === OIDS.commonName || oid === OIDS.organization) found[oid] ??= decodeString(value);
    }
  }
  const text = found[OIDS.commonName] || found[OIDS.organization] || "?";
  return text.replace(/[\x00-\x1f\x7f‎‏‪-‮⁦-⁩]/g, " ").trim().slice(0, 120);
}

function parseAlgorithm(node) {
  const [oid, params] = children(expectTag(node, 0x30));
  return { oid: oidOf(oid), params };
}

function parseCertificate(raw) {
  const cert = onlyTlv(raw, 0x30);
  const [tbs, sigAlg, sig] = children(cert);
  expectTag(tbs, 0x30);
  const f = children(tbs);
  let i = f[0].tag === 0xa0 ? 1 : 0;
  const serial = expectTag(f[i++], 0x02).value;
  i++; // algoritmo ripetuto in tbs: deve coincidere con quello esterno
  if (!sameBytes(f[i - 1].raw, sigAlg.raw)) throw new Error("Certificate algorithm mismatch");
  const issuer = expectTag(f[i++], 0x30);
  const validity = children(expectTag(f[i++], 0x30));
  const subject = expectTag(f[i++], 0x30);
  const spki = expectTag(f[i++], 0x30);
  const ext = {};
  for (; i < f.length; i++) {
    if (f[i].tag !== 0xa3) continue;
    for (const e of children(onlyTlv(f[i].value, 0x30))) {
      const parts = children(expectTag(e, 0x30));
      const id = oidOf(parts[0]);
      const critical = parts.length === 3 && parts[1].tag === 0x01 && parts[1].value[0] !== 0;
      const value = expectTag(parts[parts.length - 1], 0x04).value;
      if (ext[id]) throw new Error("Duplicate certificate extension");
      ext[id] = { critical, value };
    }
  }
  const sigBits = expectTag(sig, 0x03).value;
  if (sigBits[0] !== 0) throw new Error("Invalid signature bit string");

  const cert509 = {
    raw, tbsRaw: tbs.raw, sigAlg: parseAlgorithm(sigAlg), signature: sigBits.subarray(1),
    serial, issuerRaw: issuer.raw, subjectRaw: subject.raw, spkiRaw: spki.raw,
    issuer: displayName(issuer), subject: displayName(subject),
    notBefore: parseTime(validity[0]), notAfter: parseTime(validity[1]),
    keyAlg: parseAlgorithm(children(spki)[0]),
    unknownCritical: Object.entries(ext).filter(([id, e]) => e.critical && !KNOWN_EXTENSIONS.has(id)).map(([id]) => id)
  };

  const bc = ext["2.5.29.19"];
  cert509.isCA = false;
  cert509.pathLen = Infinity;
  if (bc) {
    for (const c of children(onlyTlv(bc.value, 0x30))) {
      if (c.tag === 0x01) cert509.isCA = c.value[0] !== 0;
      if (c.tag === 0x02) cert509.pathLen = c.value.length === 1 ? c.value[0] : Infinity;
    }
  }
  const ku = ext["2.5.29.15"];
  if (ku) {
    const bits = onlyTlv(ku.value, 0x03).value;
    cert509.keyUsage = (i) => !!(bits[1 + (i >> 3)] & (0x80 >> (i & 7)));
  }
  const eku = ext["2.5.29.37"];
  if (eku) cert509.eku = children(onlyTlv(eku.value, 0x30)).map(oidOf);
  const ski = ext["2.5.29.14"];
  if (ski) cert509.ski = onlyTlv(ski.value, 0x04).value;
  const aki = ext["2.5.29.35"];
  if (aki) cert509.akiKeyId = children(onlyTlv(aki.value, 0x30)).find((c) => c.tag === 0x80)?.value;
  return cert509;
}

// ECDSA in DER (SEQUENCE di due INTEGER) → r||s, formato di WebCrypto.
function ecdsaRaw(sigDer, size) {
  const [r, s] = children(onlyTlv(sigDer, 0x30)).map((n) => expectTag(n, 0x02).value);
  const out = new Uint8Array(size * 2);
  for (const [k, v] of [[0, r], [1, s]]) {
    let x = v;
    while (x.length > size && x[0] === 0) x = x.subarray(1);
    if (x.length > size) throw new Error("Invalid ECDSA signature");
    out.set(x, k * size + size - x.length);
  }
  return out;
}

function pssParams(params) {
  // RSASSA-PSS-params: [0] hash, [1] MGF, [2] saltLength, [3] trailer
  let hash = "SHA-1", mgfHash = "SHA-1", salt = 20;
  for (const p of params ? children(expectTag(params, 0x30)) : []) {
    const inner = onlyTlv(p.value, p.tag === 0xa2 || p.tag === 0xa3 ? 0x02 : 0x30);
    if (p.tag === 0xa0) hash = HASHES[parseAlgorithm(inner).oid];
    if (p.tag === 0xa1) {
      const mgf = parseAlgorithm(inner);
      if (mgf.oid !== OIDS.mgf1) throw unsupported("PSS MGF");
      mgfHash = HASHES[parseAlgorithm(mgf.params).oid];
    }
    if (p.tag === 0xa2) salt = inner.value.reduce((n, b) => n * 256 + b, 0);
    if (p.tag === 0xa3 && !(inner.value.length === 1 && inner.value[0] === 1)) throw unsupported("PSS trailer");
  }
  if (!hash || hash !== mgfHash) throw unsupported("PSS hash");
  return { hash, salt };
}

// Verifica una firma con la chiave pubblica di un certificato.
async function verifyWith(cert, sigAlg, digestHash, signature, data) {
  const subtle = crypto.subtle;
  let spec = SIGNATURES[sigAlg.oid];
  if (!spec && sigAlg.oid === OIDS.rsaEncryption && digestHash) spec = { scheme: "rsa", hash: digestHash };
  if (!spec && sigAlg.oid === OIDS.rsaPss) spec = { scheme: "pss", ...pssParams(sigAlg.params) };
  if (!spec) throw unsupported(`signature algorithm ${sigAlg.oid}`);

  const keyOid = cert.keyAlg.oid;
  if (spec.scheme === "ecdsa") {
    if (keyOid !== OIDS.ecPublicKey) throw invalid("key/algorithm mismatch");
    const curve = CURVES[cert.keyAlg.params?.tag === 0x06 ? oidOf(cert.keyAlg.params) : ""];
    if (!curve) throw unsupported("elliptic curve");
    const key = await subtle.importKey("spki", cert.spkiRaw, { name: "ECDSA", namedCurve: curve.name }, false, ["verify"]);
    let raw;
    try { raw = ecdsaRaw(signature, curve.size); } catch (_) { return false; }
    return subtle.verify({ name: "ECDSA", hash: spec.hash }, key, raw, data);
  }
  if (keyOid !== OIDS.rsaEncryption) throw unsupported(`key algorithm ${keyOid}`);
  if (spec.scheme === "pss") {
    const key = await subtle.importKey("spki", cert.spkiRaw, { name: "RSA-PSS", hash: spec.hash }, false, ["verify"]);
    return subtle.verify({ name: "RSA-PSS", saltLength: spec.salt }, key, signature, data);
  }
  const key = await subtle.importKey("spki", cert.spkiRaw, { name: "RSASSA-PKCS1-v1_5", hash: spec.hash }, false, ["verify"]);
  return subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, data);
}

async function digest(hashName, data) {
  return new Uint8Array(await crypto.subtle.digest(hashName, data));
}

function pemToDer(text) {
  const out = [];
  const re = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.push(base64ToBytes(m[1].replace(/\s+/g, "")));
  return out;
}

// Campo "CA aggiuntive" delle opzioni: vuoto, oppure solo certificati PEM leggibili.
const MAX_CA_PEM = 64 * 1024;
function isValidCaPem(text) {
  const s = String(text || "").trim();
  if (!s) return true;
  if (s.length > MAX_CA_PEM) return false;
  const blocks = s.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  if (!blocks.length || s.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, "").trim()) return false;
  try { pemToDer(s).forEach(parseCertificate); return true; } catch (_) { return false; }
}

function loadAnchors(extraPem) {
  if (String(extraPem || "").length > MAX_CA_PEM) extraPem = "";
  const anchors = [];
  for (const r of TSA_TRUSTED_ROOTS) {
    anchors.push({ name: r.name, cert: parseCertificate(base64ToBytes(r.der)), bundled: true });
  }
  for (const der of pemToDer(extraPem)) {
    try {
      const cert = parseCertificate(der);
      anchors.push({ name: cert.subject, cert, bundled: false });
    } catch (_) { /* PEM non valido: ignorato, le opzioni lo segnalano */ }
  }
  return anchors;
}

// Un certificato è una radice attendibile se soggetto e chiave pubblica
// coincidono con quelli di una radice: così vale anche la versione
// "cross-signed" che alcune TSA allegano al token.
function anchorFor(cert, anchors) {
  return anchors.find((a) => sameBytes(a.cert.subjectRaw, cert.subjectRaw) && sameBytes(a.cert.spkiRaw, cert.spkiRaw));
}

function validAt(cert, time) {
  return time >= cert.notBefore && time <= cert.notAfter;
}

// Risale dal certificato della TSA a una radice attendibile. Restituisce
// { anchor, chain } oppure lancia VerifyError("untrusted", motivo).
async function buildChain(signer, pool, anchors, time) {
  const untrusted = (reason) => new VerifyError("untrusted", reason);
  const chain = [signer];
  let cur = signer;
  let caBelow = 0;
  for (let depth = 0; depth < MAX_CHAIN; depth++) {
    if (cur.unknownCritical.length) throw untrusted(`unsupported critical extension in "${cur.subject}"`);
    if (!validAt(cur, time)) throw untrusted(`"${cur.subject}" not valid at the stated time`);
    const anchor = anchorFor(cur, anchors);
    if (anchor) return { anchor: anchor.name, bundled: anchor.bundled, chain: chain.map((c) => c.subject) };

    const candidates = [...anchors.map((a) => a.cert), ...pool].filter((c) =>
      sameBytes(c.subjectRaw, cur.issuerRaw) && c !== cur &&
      (!cur.akiKeyId || !c.ski || sameBytes(cur.akiKeyId, c.ski)));
    let issuer = null;
    for (const c of candidates) {
      if (!c.isCA || (c.keyUsage && !c.keyUsage(5)) || caBelow > c.pathLen) continue;
      try {
        if (await verifyWith(c, cur.sigAlg, null, cur.signature, cur.tbsRaw)) { issuer = c; break; }
      } catch (_) { /* algoritmo non gestito per questo candidato */ }
    }
    if (!issuer) {
      throw untrusted(sameBytes(cur.subjectRaw, cur.issuerRaw)
        ? `"${cur.subject}" is not a trusted root`
        : `issuer "${cur.issuer}" not found among trusted roots`);
    }
    if (cur !== signer) caBelow++;
    cur = issuer;
    chain.push(cur);
  }
  throw untrusted("certificate chain too long");
}

// Messaggio localizzato per l'esito della verifica.
function timestampCheckMessage(check) {
  const outcome = ["verified", "untrusted", "invalid", "unsupported"].includes(check?.verification)
    ? check.verification : "unsupported";
  return t(`tsa.check.${outcome}`, {
    signer: check?.signer || "?", anchor: check?.anchor || "", reason: check?.reason || "?"
  });
}

// Verifica il token contenuto in una TimeStampResp già validata da
// parseTimestampResponse (hash, nonce e policy sono già controllati lì).
async function verifyTimestampSignature(tsr, genTime, extraPem = "") {
  const result = { verification: "unsupported", reason: "", signer: "", anchor: "", chain: [] };
  try {
    const [, token] = children(onlyTlv(tsr, 0x30));
    const [ctype, wrapped] = children(expectTag(token, 0x30));
    if (oidOf(ctype) !== OIDS.signedData) throw invalid("not SignedData");
    const sd = children(onlyTlv(expectTag(wrapped, 0xa0).value, 0x30));
    const encap = children(expectTag(sd[2], 0x30));
    if (oidOf(encap[0]) !== OIDS.tstInfo) throw invalid("content is not TSTInfo");
    const tstInfo = onlyTlv(expectTag(encap[1], 0xa0).value, 0x04).value;

    const certNode = sd.find((n, i) => i > 2 && n.tag === 0xa0);
    const pool = certNode ? children(certNode).filter((n) => n.tag === 0x30).map((n) => parseCertificate(n.raw)) : [];
    const signers = children(expectTag(sd[sd.length - 1], 0x31));
    if (signers.length !== 1) throw invalid("expected exactly one signer");

    const si = children(expectTag(signers[0], 0x30));
    const sid = si[1];
    const digestAlg = parseAlgorithm(si[2]);
    const hashName = HASHES[digestAlg.oid];
    if (!hashName) throw unsupported(`digest algorithm ${digestAlg.oid}`);
    const attrs = expectTag(si[3], 0xa0);
    const sigAlg = parseAlgorithm(si[4]);
    const signature = expectTag(si[5], 0x04).value;

    // Certificato del firmatario: per emittente+seriale o per SKI.
    let signer;
    if (sid.tag === 0x30) {
      const [iss, ser] = children(sid);
      signer = pool.find((c) => sameBytes(c.issuerRaw, iss.raw) && sameBytes(c.serial, expectTag(ser, 0x02).value));
    } else if (sid.tag === 0x80) {
      signer = pool.find((c) => c.ski && sameBytes(c.ski, sid.value));
    }
    if (!signer) throw invalid("signer certificate not included in the token");
    result.signer = signer.subject;

    // Attributi firmati: tipo di contenuto, impronta e certificato (ESS).
    const seen = {};
    for (const a of children(attrs)) {
      const [type, values] = children(expectTag(a, 0x30));
      const id = oidOf(type);
      if (seen[id]) throw invalid("duplicate signed attribute");
      const vals = children(expectTag(values, 0x31));
      if (vals.length !== 1) throw invalid("multi-valued signed attribute");
      seen[id] = vals[0];
    }
    if (!seen[OIDS.contentType] || oidOf(seen[OIDS.contentType]) !== OIDS.tstInfo) throw invalid("contentType attribute");
    const md = seen[OIDS.messageDigest];
    if (!md || !sameBytes(expectTag(md, 0x04).value, await digest(hashName, tstInfo))) throw invalid("messageDigest does not match TSTInfo");

    const essV2 = seen[OIDS.signingCertificateV2], essV1 = seen[OIDS.signingCertificate];
    if (!essV2 && !essV1) throw invalid("missing signingCertificate attribute");
    for (const [node, v2] of [[essV2, true], [essV1, false]]) {
      if (!node) continue;
      const first = children(children(expectTag(node, 0x30))[0])[0];
      const parts = children(expectTag(first, 0x30));
      let essHash = "SHA-1", k = 0;
      if (v2) {
        essHash = "SHA-256";
        if (parts[0].tag === 0x30) { essHash = HASHES[parseAlgorithm(parts[0]).oid]; k = 1; }
        if (!essHash) throw unsupported("ESS hash algorithm");
      }
      if (!sameBytes(expectTag(parts[k], 0x04).value, await digest(essHash, signer.raw))) {
        throw invalid("signingCertificate does not match the signer certificate");
      }
    }

    // La firma copre gli attributi codificati come SET (tag 0x31).
    const signedBytes = new Uint8Array(attrs.raw);
    signedBytes[0] = 0x31;
    if (!(await verifyWith(signer, sigAlg, hashName, signature, signedBytes))) throw invalid("signature does not verify");

    // Certificato della TSA: uso per marca temporale.
    if (!signer.eku?.includes(OIDS.timeStamping)) throw invalid("signer certificate is not for time stamping");
    if (signer.keyUsage && !signer.keyUsage(0) && !signer.keyUsage(1)) throw invalid("signer key usage");

    const time = Date.parse(genTime);
    const anchors = loadAnchors(extraPem);
    try {
      const { anchor, bundled, chain } = await buildChain(signer, pool, anchors, time);
      Object.assign(result, { verification: "verified", anchor, anchorSource: bundled ? "bundled" : "custom", chain });
    } catch (err) {
      if (!(err instanceof VerifyError)) throw err;
      Object.assign(result, { verification: "untrusted", reason: err.message });
    }
  } catch (err) {
    // Errori di struttura (DER malformato nel token o nei certificati) contano
    // come token non valido; "unsupported" solo per algoritmi non gestiti.
    result.verification = err instanceof VerifyError ? err.outcome : "invalid";
    result.reason = err instanceof VerifyError ? err.message : `malformed token: ${err.message}`;
    result.chain = [];
  }
  return result;
}
