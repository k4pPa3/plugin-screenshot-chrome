// Contesto di rete esterno (facoltativo, disattivato di default).
//
// Registra chi risulta titolare del dominio e della rete del server e come il
// dominio si risolve, interrogando servizi terzi via HTTPS:
//   - IANA (file di bootstrap RDAP) e il registro del dominio (RDAP);
//   - il registro regionale dell'indirizzo IP (RIPE, ARIN, ...; RDAP);
//   - un servizio DNS-over-HTTPS (Cloudflare o Google).
// A questi servizi arrivano il nome di dominio e l'IP indagati: per questo la
// funzione è attivabile solo esplicitamente. Nessun cookie, nessun referrer.
// Le estensioni non possono fare query DNS né traceroute: il DNS passa da DoH
// e mostra la vista di quel risolutore, non quella del PC.

const RDAP_BOOTSTRAP = {
  dns: "https://data.iana.org/rdap/dns.json",
  ipv4: "https://data.iana.org/rdap/ipv4.json",
  ipv6: "https://data.iana.org/rdap/ipv6.json"
};

const DOH_PROVIDERS = {
  cloudflare: { url: "https://cloudflare-dns.com/dns-query", name: "Cloudflare DNS (1.1.1.1)" },
  google: { url: "https://dns.google/resolve", name: "Google Public DNS (8.8.8.8)" }
};

const DNS_TYPES = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 15: "MX", 16: "TXT", 28: "AAAA", 257: "CAA" };
const NETCONTEXT_TIMEOUT_MS = 15000;
const NETCONTEXT_MAX_BYTES = 2 * 1024 * 1024;

// Richiesta GET di un JSON pubblico, con timeout e dimensione massima.
async function fetchPublicJson(url, accept = "application/json") {
  const at = new Date().toISOString();
  const res = await fetch(url, {
    headers: { Accept: accept },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(NETCONTEXT_TIMEOUT_MS)
  });
  const declared = Number(res.headers.get("content-length"));
  if (declared > NETCONTEXT_MAX_BYTES) throw new Error(`response too large (${declared} bytes)`);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > NETCONTEXT_MAX_BYTES) { await reader.cancel(); throw new Error("response too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { bytes.set(c, pos); pos += c.length; }
  let json = null;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) {}
  return { url, finalUrl: res.url || url, status: res.status, at, json };
}

// Solo URL https: un bootstrap manomesso non deve portare a richieste in chiaro.
function httpsBase(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href.replace(/\/?$/, "/") : null;
  } catch (_) {
    return null;
  }
}

function isIpLiteral(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

// --- Indirizzi IP e intervalli CIDR ------------------------------------

function ipToBigInt(ip) {
  if (ip.includes(":")) {
    let [head, tail = ""] = ip.split("::");
    const h = head ? head.split(":") : [];
    let tl = tail ? tail.split(":") : [];
    // IPv4 finale (es. ::ffff:1.2.3.4)
    if (tl.length && tl[tl.length - 1].includes(".")) {
      const v4 = ipToBigInt(tl.pop());
      tl.push((v4 >> 16n).toString(16), (v4 & 0xffffn).toString(16));
    }
    const fill = ip.includes("::") ? 8 - h.length - tl.length : 0;
    const groups = [...h, ...Array(fill).fill("0"), ...tl];
    if (groups.length !== 8) throw new Error(`invalid IPv6 ${ip}`);
    return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g || "0", 16)), 0n);
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) throw new Error(`invalid IPv4 ${ip}`);
  return parts.reduce((acc, p) => (acc << 8n) + BigInt(p), 0n);
}

function ipInCidr(ip, cidr) {
  const [net, bits] = cidr.split("/");
  const v6 = ip.includes(":");
  if (v6 !== net.includes(":")) return false;
  const size = v6 ? 128n : 32n;
  const prefix = BigInt(bits ?? size);
  const shift = size - prefix;
  return (ipToBigInt(ip) >> shift) === (ipToBigInt(net) >> shift);
}

// --- RDAP -----------------------------------------------------------------

// Bootstrap IANA: per ogni TLD o intervallo, l'URL del servizio RDAP.
async function rdapServiceFor(kind, key) {
  const boot = await fetchPublicJson(RDAP_BOOTSTRAP[kind]);
  if (boot.status !== 200 || !boot.json?.services) throw new Error(`IANA bootstrap HTTP ${boot.status}`);
  let best = null, bestLen = -1;
  for (const [keys, urls] of boot.json.services) {
    for (const k of keys) {
      const match = kind === "dns" ? k.toLowerCase() === key : ipInCidr(key, k);
      const len = kind === "dns" ? k.length : Number(k.split("/")[1] || 0);
      if (match && len > bestLen) {
        // Preferisce https; scarta gli altri.
        const url = urls.map(httpsBase).find(Boolean);
        if (url) { best = url; bestLen = len; }
      }
    }
  }
  return { base: best, bootstrap: boot.url, publication: boot.json.publication || null };
}

function vcardValue(entity, field) {
  const props = entity?.vcardArray?.[1];
  if (!Array.isArray(props)) return "";
  const p = props.find((x) => Array.isArray(x) && x[0] === field);
  if (!p) return "";
  const v = p[3];
  return Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v ?? "");
}

function rdapEntities(obj, depth = 0) {
  const out = [];
  for (const e of obj?.entities || []) {
    out.push(e);
    if (depth < 2) out.push(...rdapEntities(e, depth + 1));
  }
  return out;
}

function rdapEvent(obj, action) {
  return (obj?.events || []).find((e) => e.eventAction === action)?.eventDate || null;
}

function entityName(e) {
  return vcardValue(e, "fn") || vcardValue(e, "org") || e?.handle || "";
}

// Sintesi leggibile di una risposta RDAP di dominio (RFC 9083).
function summarizeRdapDomain(json) {
  const entities = rdapEntities(json);
  const byRole = (role) => entities.filter((e) => (e.roles || []).includes(role)).map(entityName).filter(Boolean);
  const registrar = entities.find((e) => (e.roles || []).includes("registrar"));
  return {
    name: json.ldhName || json.unicodeName || "",
    handle: json.handle || "",
    status: json.status || [],
    registered: rdapEvent(json, "registration"),
    expires: rdapEvent(json, "expiration"),
    lastChanged: rdapEvent(json, "last changed"),
    registrar: registrar ? entityName(registrar) : "",
    registrarIanaId: registrar?.publicIds?.find((p) => /iana/i.test(p.type))?.identifier || "",
    registrant: byRole("registrant"),
    nameservers: (json.nameservers || []).map((n) => n.ldhName || n.unicodeName).filter(Boolean),
    dnssec: json.secureDNS ? !!json.secureDNS.delegationSigned : null
  };
}

// Sintesi di una risposta RDAP di rete IP.
function summarizeRdapIp(json) {
  const entities = rdapEntities(json);
  const org = entities.find((e) => (e.roles || []).includes("registrant")) || entities[0];
  const abuse = entities.find((e) => (e.roles || []).includes("abuse"));
  return {
    handle: json.handle || "",
    name: json.name || "",
    range: json.startAddress && json.endAddress ? `${json.startAddress} - ${json.endAddress}` : "",
    country: json.country || "",
    type: json.type || "",
    organization: org ? entityName(org) : "",
    abuseEmail: abuse ? vcardValue(abuse, "email") : "",
    registered: rdapEvent(json, "registration"),
    lastChanged: rdapEvent(json, "last changed")
  };
}

// Dominio registrabile: prova le ultime tre etichette, poi le ultime due.
// Prima le tre perché un registro risponde anche per il proprio suffisso
// (co.uk) ma non per i sottodomini (www.example.com): così si trova
// bbc.co.uk ed example.com. Senza la lista dei suffissi pubblici è
// un'euristica: il report indica la query effettivamente usata.
async function rdapDomain(host) {
  const labels = host.split(".").filter(Boolean);
  const tld = labels[labels.length - 1];
  const service = await rdapServiceFor("dns", tld);
  if (!service.base) {
    return { unavailable: "no-rdap", tld, whoisInfo: `https://www.iana.org/domains/root/db/${encodeURIComponent(tld)}.html`,
      bootstrap: service.bootstrap };
  }
  let last = null;
  for (const n of [3, 2]) {
    if (labels.length < n) continue;
    const domain = labels.slice(-n).join(".");
    const r = await fetchPublicJson(`${service.base}domain/${encodeURIComponent(domain)}`, "application/rdap+json");
    last = { query: domain, url: r.url, finalUrl: r.finalUrl, status: r.status, at: r.at, bootstrap: service.bootstrap };
    if (r.status === 200 && r.json) return { ...last, summary: summarizeRdapDomain(r.json), raw: r.json };
    if (r.status !== 404) break;
  }
  return { ...last, error: `HTTP ${last?.status}` };
}

async function rdapIp(ip) {
  const service = await rdapServiceFor(ip.includes(":") ? "ipv6" : "ipv4", ip);
  if (!service.base) return { ip, unavailable: "no-rdap", bootstrap: service.bootstrap };
  const r = await fetchPublicJson(`${service.base}ip/${encodeURIComponent(ip)}`, "application/rdap+json");
  const base = { ip, url: r.url, finalUrl: r.finalUrl, status: r.status, at: r.at, bootstrap: service.bootstrap };
  if (r.status === 200 && r.json) return { ...base, summary: summarizeRdapIp(r.json), raw: r.json };
  return { ...base, error: `HTTP ${r.status}` };
}

// --- DNS-over-HTTPS -------------------------------------------------------

async function dohQuery(provider, name, type) {
  const p = DOH_PROVIDERS[provider] || DOH_PROVIDERS.cloudflare;
  const url = `${p.url}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const r = await fetchPublicJson(url, "application/dns-json");
  if (r.status !== 200 || !r.json) return { name, type, url, at: r.at, error: `HTTP ${r.status}` };
  return {
    name, type, url, at: r.at,
    rcode: r.json.Status,
    dnssecValidated: !!r.json.AD,
    answers: (r.json.Answer || []).map((a) => ({
      name: String(a.name || ""), type: DNS_TYPES[a.type] || String(a.type), ttl: a.TTL, data: String(a.data ?? "")
    }))
  };
}

const settle = (promise) => promise.then((v) => v, (err) => ({ error: err?.message || String(err) }));

// Raccoglie tutto il contesto. Ogni voce fallisce da sola, senza fermare le altre.
async function collectNetContext(pageUrl, { browserIp = "", provider = "cloudflare" } = {}) {
  const host = new URL(pageUrl).hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  const out = {
    schema: "forensic-web-capture/netcontext@1",
    collectedAt: new Date().toISOString(),
    host,
    dnsProvider: (DOH_PROVIDERS[provider] || DOH_PROVIDERS.cloudflare).name,
    rdapDomain: null,
    rdapIp: null,
    dns: [],
    browserIp: browserIp || null,
    browserIpInDns: null
  };
  const literal = isIpLiteral(host);
  const query = (name, type) => settle(dohQuery(provider, name, type)).then((r) => ({ name, type, ...r }));

  const [domain, ...hostDns] = await Promise.all([
    literal ? Promise.resolve({ unavailable: "ip-literal" }) : settle(rdapDomain(host)),
    ...(literal ? [] : ["A", "AAAA", "CNAME"].map((type) => query(host, type)))
  ]);
  out.rdapDomain = domain;
  // Record della zona: sul dominio trovato via RDAP, altrimenti sulle ultime
  // due etichette del nome.
  const zone = literal ? null : (domain?.summary ? domain.query : host.split(".").slice(-2).join("."));
  const zoneDns = literal ? [] : await Promise.all(["NS", "MX", "TXT", "CAA"].map((type) => query(zone, type)));
  const dns = [...hostDns, ...zoneDns];
  out.dns = dns;

  // IP di cui cercare il titolare: quello a cui si è collegato il browser, se
  // noto (dati di rete), altrimenti il primo record A/AAAA.
  const resolved = dns.filter((d) => d.type === "A" || d.type === "AAAA")
    .flatMap((d) => (d.answers || []).filter((a) => a.type === d.type).map((a) => a.data));
  if (literal) resolved.push(host);
  if (browserIp && !literal) out.browserIpInDns = resolved.length ? resolved.includes(browserIp) : null;
  const ip = browserIp || resolved[0] || "";
  out.rdapIp = ip ? { source: browserIp ? "browser" : "dns", ...await settle(rdapIp(ip)) } : { unavailable: "no-ip" };
  return out;
}
