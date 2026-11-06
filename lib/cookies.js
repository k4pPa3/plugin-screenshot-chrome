// Cookie e storage della pagina (facoltativo).
//
// Servono a documentare lo stato del browser al momento dell'acquisizione:
// se si era autenticati e con quale account, le scelte sul consenso, lingua e
// varianti che spiegano cosa mostrava la pagina, gli identificativi di
// tracciamento. Ma i valori dei cookie di sessione e i token salvati nello
// storage sono CREDENZIALI: chi riceve il pacchetto potrebbe usarli per
// entrare nell'account. Per questo di default si salva solo l'impronta
// SHA-256 di ogni valore, che permette di dimostrare in seguito che un valore
// coincideva senza averlo diffuso. I valori in chiaro si salvano solo se
// l'utente lo sceglie nelle Impostazioni.

const STORAGE_MAX_ENTRIES = 5000;

// Espressione eseguita nel mondo isolato: legge localStorage e sessionStorage
// dell'origine della pagina. Le pagine con origine opaca (sandbox) generano
// un errore, registrato invece dei dati.
const WEB_STORAGE_EXPRESSION = `(() => {
  const dump = (name) => {
    try {
      const s = window[name];
      const out = [];
      for (let i = 0; i < s.length && i < ${STORAGE_MAX_ENTRIES}; i++) {
        const key = s.key(i);
        out.push([key, s.getItem(key)]);
      }
      return { entries: out, total: s.length };
    } catch (err) {
      return { error: String(err && err.message || err) };
    }
  };
  return { origin: location.origin, local: dump("localStorage"), session: dump("sessionStorage") };
})()`;

async function valueDigest(value, includeValues) {
  const text = String(value ?? "");
  const out = { valueLength: text.length, valueSha256: await sha256Hex(new TextEncoder().encode(text)) };
  if (includeValues) out.value = text;
  return out;
}

function cookieDomainMatches(cookieDomain, host) {
  const d = String(cookieDomain || "").replace(/^\./, "").toLowerCase();
  return !!d && (host === d || host.endsWith(`.${d}`));
}

// Cookie come restituiti da Network.getCookies (pagina e frame).
async function describeCookies(cookies, pageHost, includeValues) {
  const out = [];
  for (const c of cookies || []) {
    out.push({
      name: String(c.name ?? ""),
      domain: String(c.domain ?? ""),
      path: String(c.path ?? ""),
      expires: c.session || !(c.expires > 0) ? null : new Date(c.expires * 1000).toISOString(),
      session: !!c.session || !(c.expires > 0),
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      sameSite: c.sameSite || null,
      partitioned: !!c.partitionKey,
      thirdParty: !cookieDomainMatches(c.domain, pageHost),
      size: c.size ?? null,
      ...await valueDigest(c.value, includeValues)
    });
  }
  return out.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
}

async function describeWebStorage(dump, includeValues) {
  if (!dump || dump.error) return { error: dump?.error || "not available", entries: [] };
  const entries = [];
  for (const [key, value] of dump.entries || []) entries.push({ key: String(key ?? ""), ...await valueDigest(value, includeValues) });
  return { total: dump.total ?? entries.length, truncated: (dump.total ?? 0) > entries.length, entries };
}

// Documento <id>.storage.json, senza valori se non richiesti.
async function buildBrowserState(raw, { pageUrl, includeValues, collectedAt }) {
  const host = (() => { try { return new URL(pageUrl).hostname.toLowerCase(); } catch (_) { return ""; } })();
  const cookies = await describeCookies(raw.cookies, host, includeValues);
  return {
    schema: "forensic-web-capture/storage@1",
    collectedAt,
    url: pageUrl,
    origin: raw.storage?.origin || null,
    valuesIncluded: !!includeValues,
    valueDigest: "SHA-256 of the UTF-8 value",
    cookies,
    localStorage: await describeWebStorage(raw.storage?.local, includeValues),
    sessionStorage: await describeWebStorage(raw.storage?.session, includeValues)
  };
}

// Contatori per report e copertina.
function browserStateSummary(state) {
  const c = state.cookies || [];
  return {
    cookies: c.length,
    httpOnly: c.filter((x) => x.httpOnly).length,
    thirdParty: c.filter((x) => x.thirdParty).length,
    local: state.localStorage?.error ? null : state.localStorage?.total ?? 0,
    session: state.sessionStorage?.error ? null : state.sessionStorage?.total ?? 0,
    valuesIncluded: state.valuesIncluded
  };
}
