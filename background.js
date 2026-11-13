// Usa il Chrome DevTools Protocol, lo stesso meccanismo di
// "Capture full size screenshot" in DevTools.

importScripts(
  "lib/i18n.js", "lib/locales/en.js", "lib/locales/it.js", "lib/locales/fr.js", "lib/locales/es.js",
  "lib/common.js", "lib/pdf.js", "lib/zip.js", "lib/tsa.js", "lib/tsaroots.js", "lib/tsaverify.js", "lib/vault.js",
  "lib/har.js", "lib/integrity.js", "lib/netcontext.js", "lib/cookies.js", "lib/eml.js", "lib/reporthtml.js"
);

// Aggiornando da una versione che salvava le credenziali in chiaro, le toglie dal disco.
chrome.runtime.onInstalled.addListener(() => { migratePlaintextSecrets().catch(() => {}); });

// Lingua di messaggi e report: segue l'impostazione, anche quando cambia.
// Anche il tooltip dell'icona: _locales seguirebbe solo la lingua del browser.
function applyLanguage(preference) {
  setLanguage(preference);
  try { chrome.action?.setTitle?.({ title: t("action.title") }); } catch (_) {}
}
getSettings().then((s) => applyLanguage(s.language));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) applyLanguage(changes.settings.newValue?.language);
});

const PROTOCOL_VERSION = "1.3";

function send(target, method, params = {}) {
  return chrome.debugger.sendCommand(target, method, params);
}

// Caratteri di controllo e di direzione del testo (usabili per mascherare
// nomi di file o iniettare sequenze nel terminale).
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

// Testo proveniente dalla pagina o dal server, ridotto a una riga sicura.
function cleanText(value) {
  return String(value ?? "").replace(UNSAFE_CHARS, " ").replace(/ {2,}/g, " ").trim();
}

// Nasconde l'eventuale password scritta nell'URL (https://utente:password@host).
function redactUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.href;
  } catch (_) {
    return cleanText(url);
  }
}

// I cookie impostati dal server darebbero accesso all'account a chi riceve
// il report: si conservano nomi e attributi, non i valori.
function redactHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k] = k.toLowerCase() === "set-cookie"
      ? String(v).split("\n").map((c) => c.replace(/^([^=;]*)=[^;]*/, (_, name) => `${name}=${t("value.redacted")}`)).join("\n")
      : v;
  }
  return out;
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

// Il codice dell'estensione gira in un "mondo isolato": la pagina non può
// alterare le funzioni del DOM che usa (es. falsificare outerHTML) né
// bloccarlo ridefinendo setTimeout.
async function createIsolatedWorld(target) {
  const { frameTree } = await send(target, "Page.getFrameTree");
  const { executionContextId } = await send(target, "Page.createIsolatedWorld", {
    frameId: frameTree.frame.id,
    worldName: "full-page-screenshot"
  });
  return executionContextId;
}

async function evaluate(target, contextId, expression, timeoutMs) {
  const res = await withTimeout(
    send(target, "Runtime.evaluate", { expression, contextId, awaitPromise: true, returnByValue: true }),
    timeoutMs,
    t("err.pageTimeout")
  );
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result?.value;
}

// Il DOM non affidabile viene mostrato come sorgente inerte: non reinserirlo
// come markup e non cercare <head> con regex (può comparire in un commento).
const SAVED_HTML_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'";

function protectHtml(html) {
  const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SAVED_HTML_CSP}"><title>HTML source</title></head><body><pre>${escape(html)}</pre></body></html>`;
}

function powershellLiteral(value) {
  return "'" + String(value).replace(/['\u2018\u2019\u201a\u201b]/g, (ch) => ch + ch) + "'";
}

function shellLiteral(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function formatFingerprint(hex) {
  return hex.toUpperCase().match(/../g).join(":");
}

// Certificato DER (base64, come lo restituisce DevTools) in PEM, leggibile con
// openssl x509 -in <file> -text -noout
function derToPem(b64) {
  return `-----BEGIN CERTIFICATE-----\n${String(b64).match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
}

function isoFromSeconds(s) {
  return typeof s === "number" ? new Date(s * 1000).toISOString() : "";
}

// Ricarica la pagina con il debugger attivo per registrare risposta HTTP,
// indirizzo IP del server, catena di redirect e certificato TLS.
async function collectNetworkInfo(target, settings, lifecycle = null) {
  const { frameTree } = await send(target, "Page.getFrameTree");
  const mainFrame = frameTree.frame.id;
  const net = { redirects: [], document: null, certificate: null };
  const har = settings.features.har ? createHarRecorder() : null;

  let loadCompleted = false, loadTimedOut = false;
  const startedAt = new Date().toISOString();
  let onLoad;
  const loaded = new Promise((r) => { onLoad = r; });
  const listener = (source, method, params) => {
    if (source.tabId !== target.tabId) return;
    if (method === "Page.loadEventFired") { loadCompleted = true; onLoad(); }
    if (har && method.startsWith("Network.")) har.onEvent(method, params);
    if (params?.type !== "Document" || params.frameId !== mainFrame) return;
    if (method === "Network.requestWillBeSent" && params.redirectResponse) {
      const r = params.redirectResponse;
      net.redirects.push({ url: r.url, status: r.status, remoteIPAddress: r.remoteIPAddress || "" });
    }
    if (method === "Network.responseReceived") {
      const r = params.response;
      net.document = {
        receivedAt: Date.now(),
        url: r.url,
        status: r.status,
        statusText: r.statusText,
        protocol: r.protocol,
        remoteIPAddress: r.remoteIPAddress || "",
        remotePort: r.remotePort,
        mimeType: r.mimeType,
        securityState: r.securityState,
        fromServiceWorker: !!r.fromServiceWorker,
        fromDiskCache: !!r.fromDiskCache,
        headers: redactHeaders(r.headers),
        security: r.securityDetails ? {
          protocol: r.securityDetails.protocol,
          cipher: r.securityDetails.cipher,
          keyExchange: r.securityDetails.keyExchange || r.securityDetails.keyExchangeGroup,
          subjectName: r.securityDetails.subjectName,
          issuer: r.securityDetails.issuer,
          sanList: r.securityDetails.sanList,
          validFrom: isoFromSeconds(r.securityDetails.validFrom),
          validTo: isoFromSeconds(r.securityDetails.validTo),
          sctCount: Array.isArray(r.securityDetails.signedCertificateTimestampList)
            ? r.securityDetails.signedCertificateTimestampList.length : null,
          ctCompliance: r.securityDetails.certificateTransparencyCompliance || null
        } : null
      };
    }
  };

  // Contenuti delle risposte: impronta di ciascuno e, entro i limiti, copia
  // nell'HAR. Vanno letti prima di staccare il debugger.
  const finishHar = async () => {
    chrome.debugger.onEvent.removeListener(listener);
    if (!har) return;
    const endedAt = new Date().toISOString();
    let total = 0;
    const entries = har.entries();
    for (const e of entries) {
      if (e.redirect) { e.bodyOmitted = "redirect"; continue; }
      if (!e.finished || e.failed) { e.bodyOmitted = e.failed ? "failed" : "pending"; continue; }
      try {
        const body = await send(target, "Network.getResponseBody", { requestId: e.requestId });
        const bytes = harBodyBytes(body);
        e.bodySize = bytes.length;
        e.sha256 = await sha256Hex(bytes);
        if (bytes.length > HAR_MAX_BODY_EACH) e.bodyOmitted = "size";
        else if (total + bytes.length > HAR_MAX_BODY_TOTAL) e.bodyOmitted = "total";
        else { total += bytes.length; e.bodyText = body.body; e.bodyBase64 = !!body.base64Encoded; }
      } catch (_) {
        e.bodyOmitted = "unavailable";
      }
    }
    net.harEntries = entries;
    net.harCollection = { startedAt, endedAt, loadCompleted, loadTimedOut, ...har.summary(),
      pending: entries.filter((e) => !e.finished && !e.failed).length,
      bodiesOmitted: entries.filter((e) => e.bodyOmitted).length,
      bodyBytesStored: total, maxEntries: HAR_MAX_ENTRIES,
      maxBodyBytes: HAR_MAX_BODY_EACH, maxTotalBodyBytes: HAR_MAX_BODY_TOTAL };
  };


  chrome.debugger.onEvent.addListener(listener);
  let recording = false;
  try {
    // Buffer più ampi: i contenuti servono ancora dopo il caricamento.
    await send(target, "Network.enable", har ? { maxTotalBufferSize: 200 * 1024 * 1024, maxResourceBufferSize: 20 * 1024 * 1024 } : {});
    await send(target, "Network.setBypassServiceWorker", { bypass: true }).catch(() => {});
    await send(target, "Page.reload", { ignoreCache: true });
    await Promise.race([loaded, sleep(settings.advanced.loadTimeout)]);
    loadTimedOut = !loadCompleted;
    await sleep(1500);
    recording = true;
  } finally {
    if (!recording || !lifecycle || !har) chrome.debugger.onEvent.removeListener(listener);
  }

  // Confronta l'orologio del PC con l'header Date del server (precisione 1 s).
  // Se la risposta arriva dalla cache di una CDN, Date è l'ora in cui l'ha
  // generata l'origine e Age dice da quanti secondi è in cache: l'ora del
  // server al momento della risposta è Date + Age.
  if (lifecycle && har) {
    lifecycle.finish = finishHar;
    lifecycle.stop = () => chrome.debugger.onEvent.removeListener(listener);
  }
  const headers = net.document?.headers || {};
  const header = (name) => Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];
  const dateTime = Date.parse(header("date") || "");
  if (Number.isFinite(dateTime)) {
    const age = Number.parseInt(header("age"), 10);
    net.serverDate = new Date(dateTime).toISOString();
    if (age > 0) net.cacheAgeSeconds = age;
    const serverNow = dateTime + (age > 0 ? age * 1000 : 0);
    const skew = Math.round((serverNow - net.document.receivedAt) / 1000);
    // Oltre un'ora di scarto il dato non è attendibile (cache senza Age, proxy...).
    if (Math.abs(skew) <= 3600) net.clockSkewSeconds = skew;
  }

  if (net.document?.url?.startsWith("https:")) {
    try {
      const { tableNames } = await send(target, "Network.getCertificate", {
        origin: new URL(net.document.url).origin
      });
      if (tableNames?.length) {
        const der = base64ToBytes(tableNames[0]);
        net.certificate = {
          sha256: formatFingerprint(await sha256Hex(der)),
          chainLength: tableNames.length
        };
        // Catena completa, salvata come reperto <id>.cert.pem (non nel JSON).
        net.chainPem = tableNames.map(derToPem).join("");
      }
    } catch (_) {}
  }
  if (net.document?.security) {
    net.tlsInterception = detectTlsInterception(net.document.security, net.document.receivedAt);
  }
  if (!lifecycle || !har) await finishHar();
  return net;
}

// Errore che ferma la cattura prima dello screenshot: il popup propone di
// disattivare la protezione e ricontrollare, oppure di acquisire comunque.
class TlsInterceptionError extends Error {
  constructor(info) {
    super(t("err.tlsInterception", { issuer: info.product || info.issuer }));
    this.code = "tls.interception";
    this.info = info;
  }
}

async function autoScroll(target, world, settings) {
  const limit = Number(settings.advanced.loadTimeout) || DEFAULT_SETTINGS.advanced.loadTimeout;
  const maxHeight = Number(settings.advanced.maxHeight) || DEFAULT_SETTINGS.advanced.maxHeight;
  await evaluate(target, world, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const start = Date.now();
    let y = 0;
    while (y < Math.min(document.documentElement.scrollHeight, ${maxHeight}) && Date.now() - start < ${limit}) {
      window.scrollTo(0, y);
      await wait(250);
      y += Math.max(200, window.innerHeight * 0.8);
    }
    window.scrollTo(0, 0);
    await wait(500);
  })()`, limit + 5000);
}

async function capture(tab, settings, { override = false, log = () => {} } = {}) {
  const { features, advanced } = settings;
  const width = Number(settings.width) || 0;
  const target = { tabId: tab.id };
  await chrome.debugger.attach(target, PROTOCOL_VERSION);
  log("debugger.attach", { url: redactUrl(tab.url) });

  const result = { network: null, networkError: null };
  const networkLifecycle = {};
  try {
    await send(target, "Page.enable");

    if (features.network) {
      try {
        log("network.reload");
        result.network = await collectNetworkInfo(target, settings, networkLifecycle);
        result.chainPem = result.network.chainPem || null;
        delete result.network.chainPem;
        const d = result.network.document;
        log("network.response", d ? { status: d.status, ip: d.remoteIPAddress, redirects: result.network.redirects.length } : { document: null });
      } catch (err) {
        result.networkError = err.message;
        log("network.error", { error: err.message });
      }
      const tls = result.network?.tlsInterception;
      if (tls) log("tls.check", { status: tls.status, signals: tls.signals.join(",") });
      if (tls && tls.status !== "none") {
        if (advanced.tlsCheck && !override) throw new TlsInterceptionError(tls);
        log("tls.override", { confirmed: override });
        tls.userOverride = override;
      }
    }
    // Dopo l'eventuale ricarica: il mondo isolato è legato al documento.
    const world = features.autoScroll || features.screenshot || features.html || features.text || features.storage
      ? await createIsolatedWorld(target) : null;
    if (features.autoScroll) {
      log("page.autoScroll");
      await autoScroll(target, world, settings);
    }

    const initial = await send(target, "Page.getLayoutMetrics");
    const viewport = initial.cssLayoutViewport || initial.layoutViewport;
    const pageWidth = Math.ceil(width || viewport.clientWidth);
    const mobile = !!width && width < 768;

    let pageHeight = Math.ceil((initial.cssContentSize || initial.contentSize).height);
    result.width = features.screenshot ? pageWidth : Math.ceil(viewport.clientWidth);
    if (features.screenshot) {
      const setViewport = (height) =>
        send(target, "Emulation.setDeviceMetricsOverride", {
          width: pageWidth,
          height,
          deviceScaleFactor: 0,
          mobile
        });
      // Limite all'altezza: una pagina che cresce all'infinito esaurirebbe la
      // memoria dell'estensione.
      const maxHeight = Number(advanced.maxHeight) || DEFAULT_SETTINGS.advanced.maxHeight;
      const contentHeight = async () => {
        const m = await send(target, "Page.getLayoutMetrics");
        const h = Math.ceil((m.cssContentSize || m.contentSize).height);
        if (h > maxHeight) result.fullHeight = Math.max(result.fullHeight || 0, h);
        return Math.min(h, maxHeight);
      };

      // Prima imposta la larghezza, poi allarga la finestra simulata fino
      // all'altezza dell'intera pagina, come fa DevTools: così anche i siti
      // che disegnano solo la parte visibile (es. Reddit) vengono resi per
      // intero invece di ripetere la stessa porzione.
      await setViewport(viewport.clientHeight);
      await sleep(300);
      pageHeight = await contentHeight();
      for (let i = 0; i < 3; i++) {
        await setViewport(pageHeight);
        await sleep(advanced.settleDelay);
        const h = await contentHeight();
        if (h <= pageHeight) break;
        pageHeight = h; // la pagina ha caricato altro contenuto
      }
      log("page.layout", { width: pageWidth, height: pageHeight, truncatedFrom: result.fullHeight || null });
      await evaluate(target, world, "window.scrollTo(0, 0)", 5000);
      await sleep(200);

      result.date = new Date();
      // Il PDF incorpora lo screenshot come JPEG.
      const imageFormat = settings.format === "png" ? "png" : "jpeg";
      const params = {
        format: imageFormat,
        captureBeyondViewport: true,
        fromSurface: true,
        clip: { x: 0, y: 0, width: pageWidth, height: pageHeight, scale: 1 }
      };
      if (imageFormat === "jpeg") params.quality = advanced.jpegQuality;

      const { data } = await send(target, "Page.captureScreenshot", params);
      result.image = base64ToBytes(data);
      log("screenshot", { format: imageFormat, bytes: result.image.length });
    } else {
      result.date = new Date();
    }
    result.height = pageHeight;

    // Indirizzo e titolo effettivi al momento dell'acquisizione.
    const history = await send(target, "Page.getNavigationHistory");
    const entry = history.entries[history.currentIndex] || {};
    result.url = entry.url || tab.url || "";
    result.title = entry.title || tab.title || "";
    // Come si è arrivati alla pagina: le ultime voci della scheda fino a quella
    // attuale (facoltativo, può rivelare altre pagine visitate).
    if (advanced.tabHistory) {
      result.history = history.entries.slice(0, history.currentIndex + 1).slice(-10).map((e) => ({
        url: redactUrl(e.url), title: cleanText(e.title), transition: e.transitionType || ""
      }));
      log("tab.history", { entries: result.history.length });
    }

    if (features.mhtml) {
      const { data: mhtml } = await send(target, "Page.captureSnapshot", { format: "mhtml" });
      result.mhtml = new TextEncoder().encode(mhtml);
      log("snapshot.mhtml", { bytes: result.mhtml.length });
    }
    if (features.html) {
      const html = await evaluate(target, world,
        `(document.doctype ? new XMLSerializer().serializeToString(document.doctype) + "\\n" : "") + document.documentElement.outerHTML`,
        30000);
      result.html = new TextEncoder().encode(protectHtml(String(html)));
      log("snapshot.html", { bytes: result.html.length });
    }
    if (features.text) {
      // Il testo come lo legge chi guarda la pagina e gli indirizzi dei link
      // del documento principale: lo screenshot non è ricercabile, questo file
      // sì. È un'aggiunta: se non riesce, l'acquisizione prosegue con un avviso.
      try {
        const page = await evaluate(target, world, `({
          text: document.body ? document.body.innerText : "",
          links: [...new Set([...document.links].map((a) => {
            // Nei link SVG href non è una stringa ma un SVGAnimatedString.
            if (typeof a.href === "string") return a.href;
            try { return new URL(a.href.baseVal, document.baseURI).href; } catch (_) { return ""; }
          }).filter(Boolean))]
        })`, 30000);
        const links = (Array.isArray(page?.links) ? page.links : []).map(String);
        result.text = { text: String(page?.text ?? ""), links: links.slice(0, MAX_LINKS), totalLinks: links.length };
        log("snapshot.text", { chars: result.text.text.length, links: result.text.totalLinks });
      } catch (err) {
        result.textError = err.message;
        log("snapshot.text.error", { error: err.message });
      }
    }
    if (features.storage) {
      // Cookie della pagina e dei suoi frame (anche HttpOnly) e storage
      // dell'origine. I valori restano qui solo fino alla conversione in
      // impronte (vedi lib/cookies.js). Se non riesce, si prosegue con un avviso.
      try {
        const { cookies } = await send(target, "Network.getCookies");
        const storage = await evaluate(target, world, WEB_STORAGE_EXPRESSION, 15000);
        result.browserState = { cookies: cookies || [], storage, at: new Date().toISOString() };
        log("snapshot.storage", { cookies: result.browserState.cookies.length,
          localStorage: storage?.local?.total ?? null, sessionStorage: storage?.session?.total ?? null });
      } catch (err) {
        result.storageError = err.message;
        log("snapshot.storage.error", { error: err.message });
      }
    }
    if (networkLifecycle.finish) {
      await networkLifecycle.finish();
      result.harEntries = result.network.harEntries;
      delete result.network.harEntries;
      log("network.har", { ...result.network.harCollection,
        hashed: result.harEntries.filter((e) => e.sha256).length });
    }
  } finally {
    networkLifecycle.stop?.();
    if (features.screenshot) {
      try { await send(target, "Emulation.clearDeviceMetricsOverride"); } catch (_) {}
    }
    try {
      await chrome.debugger.detach(target);
    } catch (_) {}
    log("debugger.detach");
  }
  return result;
}

const MAX_LINKS = 20000;

// File di testo: intestazione, testo visibile così com'è, poi un link per riga
// (con l'eventuale password nell'URL oscurata, come nei report).
function buildTextFile(acq, page) {
  const more = page.totalLinks - page.links.length;
  return [
    t("text.header", { url: acq.url, date: acq.date.toISOString() }),
    "",
    `=== ${t("text.visible")} ===`,
    "",
    page.text,
    "",
    `=== ${t("text.links", { n: page.totalLinks })} ===`,
    "",
    ...page.links.map(redactUrl),
    ...(more > 0 ? [t("text.moreLinks", { n: more })] : [])
  ].join("\n") + "\n";
}

// Scarto positivo = l'orologio del PC è indietro rispetto al riferimento.
function skewText(seconds, refKey) {
  if (!Number.isFinite(seconds)) return t("skew.na");
  const ref = t(refKey);
  if (Math.abs(seconds) <= 2) return t("skew.none", { ref });
  return t("skew.value", { direction: t(seconds > 0 ? "clock.behind" : "clock.ahead"), seconds: Math.abs(seconds), ref });
}

// In copertina gli elenchi lunghi vengono accorciati; il report li riporta interi.
const COVER_MAX_SAN = 8;
const COVER_MAX_REDIRECTS = 3;
const COVER_MAX_VALUE = 400;

function networkRows(net, error, compact = false) {
  if (error) return [[t("row.error"), error]];
  const harRows = net?.harCollection ? [[t("row.harCollection"), t("har.collection", net.harCollection)]] : [];
  if (!net?.document) return [[t("row.status"), t("net.noDocument")], ...harRows];
  const d = net.document;
  const rows = [
    ...harRows,
    [t("row.finalUrl"), d.url],
    [t("row.httpResponse"), `${d.status} ${d.statusText || ""}`.trim()],
    [t("row.protocol"), d.protocol || ""],
    [t("row.serverIp"), d.remoteIPAddress ? `${d.remoteIPAddress}${d.remotePort ? ":" + d.remotePort : ""}` : t("value.notAvailable")]
  ];
  if (d.fromServiceWorker || d.fromDiskCache) {
    rows.push([t("row.origin"), t(d.fromServiceWorker ? "net.serviceWorker" : "net.diskCache")]);
  }
  const redirects = compact ? net.redirects.slice(0, COVER_MAX_REDIRECTS) : net.redirects;
  redirects.forEach((r, i) => rows.push([t("row.redirect", { n: i + 1 }), `${r.status} ${r.url}${r.remoteIPAddress ? " (" + r.remoteIPAddress + ")" : ""}`]));
  if (net.redirects.length > redirects.length) {
    rows.push(["", t("cover.more", { n: net.redirects.length - redirects.length })]);
  }
  if (d.security) {
    const s = d.security;
    rows.push(
      [t("row.tls"), `${s.protocol} ${s.cipher}${s.keyExchange ? " / " + s.keyExchange : ""}`],
      [t("row.certificate"), s.subjectName],
      [t("row.issuer"), s.issuer],
      [t("row.validity"), `${s.validFrom} - ${s.validTo}`]
    );
    if (Number.isFinite(s.sctCount)) {
      rows.push([t("row.ct"), t("ct.value", { n: s.sctCount, compliance: s.ctCompliance || "unknown" })]);
    }
    const tls = net.tlsInterception;
    if (tls) {
      rows.push([t("row.tlsInterception"), tls.status === "none" ? t("tls.none")
        : t(`tls.${tls.status}`, { issuer: tls.product || tls.issuer, signals: tls.signals.join(", ") })
          + (tls.userOverride ? ` ${t("tls.override")}` : "")]);
    }
    if (s.sanList?.length) {
      const names = compact ? s.sanList.slice(0, COVER_MAX_SAN) : s.sanList;
      const more = s.sanList.length - names.length;
      rows.push([t("row.san"), names.join(", ") + (more ? ` ${t("cover.more", { n: more })}` : "")]);
    }
  }
  if (net.certificate) rows.push([t("row.certFingerprint"), `SHA-256 ${net.certificate.sha256}`]);
  if (net.certificate?.file) {
    rows.push([t("row.certChain"), t("row.certChain.value", { file: net.certificate.file, n: net.certificate.chainLength })]);
  }
  if (net.serverDate) {
    rows.push([t("row.serverDate"), net.cacheAgeSeconds
      ? t("net.cached", { date: net.serverDate, age: net.cacheAgeSeconds })
      : net.serverDate]);
    rows.push([t("row.clock"), Number.isFinite(net.clockSkewSeconds)
      ? skewText(net.clockSkewSeconds, "ref.server")
      : t("net.clockUnverifiable")]);
  }
  return rows;
}

function custodyRows(acq) {
  const c = acq.custody || {};
  const v = (x) => x || t("custody.notGiven");
  return [
    [t("row.operator"), v(c.operator)],
    [t("row.organization"), v(c.organization)],
    [t("row.caseRef"), v(c.caseRef)],
    [t("row.purpose"), v(c.notes)]
  ];
}

// Una riga per passo: ora UTC, codice del passo (stabile, non tradotto) e dettagli.
function logLines(log) {
  return (log || []).map((e) => {
    const detail = e.detail ? Object.entries(e.detail).filter(([, x]) => x !== null && x !== undefined && x !== "")
      .map(([k, x]) => `${k}=${cleanText(x)}`).join(" ") : "";
    return `${e.at}  ${e.step.padEnd(18)} ${detail}`.trimEnd();
  });
}

function pageRows(acq) {
  const rows = [[t("row.url"), acq.url]];
  if (acq.initialUrl) rows.push([t("row.initialUrl"), t("row.initialUrl.value", { url: acq.initialUrl })]);
  rows.push(
    [t("row.title"), acq.title],
    [t("row.size"), t("row.size.value", { width: acq.width, height: acq.height })]
  );
  if (acq.fullHeight) rows.push([t("row.truncated"), t("row.truncated.value", { height: acq.height, full: acq.fullHeight })]);
  rows.push([t("row.emulatedWidth"), acq.emulatedWidth ? `${acq.emulatedWidth} px` : t("row.emulatedWidth.window")]);
  return rows;
}

function timeRows(acq) {
  return [
    [t("row.utc"), acq.date.toISOString()],
    [t("row.local"), localIsoWithOffset(acq.date)],
    [t("row.timezone"), acq.timezone],
    [t("row.unix"), String(acq.date.getTime())]
  ];
}

function envRows(acq) {
  const env = acq.environment || {};
  const rows = [
    [t("row.browser"), acq.userAgent],
    ...(env.os ? [[t("row.os"), env.os]] : []),
    [t("row.extension"), acq.extension],
    [t("row.codeFingerprint"), env.code ? `SHA-256 ${env.code.sha256}` : t("value.notAvailable")]
  ];
  if (env.extensions) {
    const altering = env.extensions.filter((x) => x.canAlterPages).length;
    rows.push([t("row.otherExtensions"), t("env.extensions", { n: env.extensions.length, altering })]);
  } else if (env.extensionsError) {
    rows.push([t("row.otherExtensions"), t("value.notAvailable")]);
  }
  return rows;
}

function extensionRows(acq) {
  return (acq.environment?.extensions || []).map((x) => [
    x.name, `${x.id} ${x.version}${x.canAlterPages ? " — " + t("env.canAlter") : ""}${x.sensitive.length ? " [" + x.sensitive.join(", ") + "]" : ""}`
  ]);
}

function historyRows(acq) {
  return (acq.history || []).map((h, i, all) => [
    i === all.length - 1 ? t("history.current") : t("history.n", { n: i + 1 }),
    `${h.url}${h.transition ? " (" + h.transition + ")" : ""}`
  ]);
}

function buildCover(acq, relatedFiles) {
  const sections = [
    { title: t("cover.custody"), rows: custodyRows(acq) },
    { title: t("cover.page"), rows: pageRows(acq) },
    { title: t("cover.time"), rows: timeRows(acq) },
    { title: t("cover.env"), rows: envRows(acq) }
  ];
  if (acq.features.network) {
    sections.push({ title: t("cover.network"), rows: networkRows(acq.network, acq.networkError, true) });
  }
  if (acq.features.netContext) {
    sections.push({ title: t("cover.netContext"), rows: netContextRows(acq.netContext, acq.netContextError, true) });
  }
  if (acq.features.storage && (acq.storage || acq.storageError)) {
    sections.push({ title: t("cover.storage"), rows: storageRows(acq).filter(([label]) => label !== t("row.file")) });
  }
  if (relatedFiles.length) {
    sections.push({
      title: t("cover.files"),
      rows: relatedFiles.flatMap((f) => [[f.role, f.name], ["SHA-256", f.sha256]])
    });
  }
  // Un valore lunghissimo (es. URL con molti parametri) occuperebbe mezza pagina.
  const shorten = (value) => {
    const text = cleanText(value);
    return text.length > COVER_MAX_VALUE ? `${text.slice(0, COVER_MAX_VALUE)}… ${t("cover.truncated")}` : text;
  };
  for (const section of sections) section.rows = section.rows.map(([label, value]) => [label, shorten(value)]);
  const notes = [
    t("cover.note.screenshot"),
    t("cover.note.hash"),
    t(acq.features.timestamp ? "cover.note.tsa" : "cover.note.clock")
  ];
  const tls = acq.network?.tlsInterception;
  if (tls && tls.status !== "none") notes.unshift(t("cover.note.tlsInterception", { issuer: tls.product || tls.issuer }));
  // Badge dell'intestazione: indicazioni brevi e quasi indipendenti dalla lingua.
  const badges = ["SHA-256"];
  if (acq.features.timestamp) badges.push("RFC 3161");
  if (tls) badges.push(tls.status === "none" ? "TLS OK" : "TLS !");
  if (acq.features.har) badges.push("HAR");
  if (acq.features.netContext) badges.push("RDAP / DNS");
  if (acq.custody?.caseRef) badges.push(acq.custody.caseRef.slice(0, 40));
  return {
    title: t("cover.title"),
    subtitle: `${acq.extension} - ${localIsoWithOffset(acq.date)}`,
    badges,
    footer: acq.url.length > 90 ? acq.url.slice(0, 87) + "..." : acq.url,
    pageLabel: (n) => t("cover.pageN", { n }),
    sections,
    notes
  };
}

function timestampRows(ts) {
  if (!ts) return [];
  if (ts.error) return [[t("row.error"), ts.error]];
  if (ts.status === "requested") return [
    [t("row.tsaService"), ts.url],
    [t("row.tsaTarget"), ts.target],
    [t("row.result"), t("tsa.pendingReceipt", { file: ts.receipt })]
  ];
  return [
    [t("row.tsaService"), ts.url],
    [t("row.tsaTarget"), ts.target],
    [t("row.tsaTime"), ts.genTime],
    [t("row.serial"), ts.serial],
    [t("row.policy"), ts.policy],
    [t("row.result"), ts.status],
    [t("row.token"), ts.file],
    [t("row.clock"), skewText(ts.clockSkewSeconds, "ref.tsa")]
  ];
}

// Contesto di rete esterno: RDAP del dominio e dell'IP, DNS via DoH. In
// copertina (compact) solo le righe essenziali.
function netContextRows(nc, error, compact = false) {
  if (error) return [[t("row.error"), error]];
  if (!nc) return [];
  const rows = [];
  const d = nc.rdapDomain || {};
  if (d.summary) {
    const s = d.summary;
    rows.push([t("row.ncDomain"), s.name || d.query]);
    if (s.registrar) rows.push([t("row.ncRegistrar"), s.registrar + (s.registrarIanaId ? ` (IANA ${s.registrarIanaId})` : "")]);
    if (s.registrant.length) rows.push([t("row.ncRegistrant"), s.registrant.join(", ")]);
    if (s.registered) rows.push([t("row.ncRegistered"), s.registered]);
    if (s.expires) rows.push([t("row.ncExpires"), s.expires]);
    if (!compact) {
      if (s.lastChanged) rows.push([t("row.ncChanged"), s.lastChanged]);
      if (s.status.length) rows.push([t("row.ncStatus"), s.status.join(", ")]);
      if (s.nameservers.length) rows.push([t("row.ncNameservers"), s.nameservers.join(", ")]);
      if (s.dnssec !== null) rows.push(["DNSSEC", t(s.dnssec ? "nc.dnssec.yes" : "nc.dnssec.no")]);
      rows.push([t("row.ncSource"), d.finalUrl || d.url]);
    }
  } else if (d.unavailable === "no-rdap") {
    rows.push([t("row.ncDomain"), t("nc.noRdap", { tld: d.tld, url: d.whoisInfo })]);
  } else if (d.unavailable !== "ip-literal") {
    rows.push([t("row.ncDomain"), t("nc.failed", { error: d.error || "?" })]);
  }

  const ip = nc.rdapIp || {};
  if (ip.summary) {
    const s = ip.summary;
    rows.push([t("row.ncIp"), `${ip.ip} (${t(ip.source === "browser" ? "nc.ipBrowser" : "nc.ipDns")})`]);
    if (s.organization) rows.push([t("row.ncOrg"), s.organization]);
    rows.push([t("row.ncNetwork"), [s.name, s.handle, s.country].filter(Boolean).join(" - ")]);
    if (!compact) {
      if (s.range) rows.push([t("row.ncRange"), s.range]);
      if (s.abuseEmail) rows.push([t("row.ncAbuse"), s.abuseEmail]);
      rows.push([t("row.ncSource"), ip.finalUrl || ip.url]);
    }
  } else if (ip.ip || ip.error) {
    rows.push([t("row.ncIp"), t("nc.failed", { error: ip.error || "?" })]);
  }

  for (const q of nc.dns || []) {
    if (compact && q.type !== "A" && q.type !== "AAAA") continue;
    const values = q.error ? t("nc.failed", { error: q.error })
      : (q.answers || []).filter((a) => a.type === q.type).map((a) => a.data).join(", ") || t("nc.noRecords");
    rows.push([`DNS ${q.type}`, `${q.name}: ${values}`]);
  }
  if (nc.dns?.length && !compact) {
    const validated = nc.dns.some((q) => q.dnssecValidated);
    rows.push([t("row.ncResolver"), nc.dnsProvider + (validated ? ` - ${t("nc.dnssecValidated")}` : "")]);
  }
  if (nc.browserIpInDns !== null && nc.browserIpInDns !== undefined) {
    rows.push([t("row.ncMatch"), t(nc.browserIpInDns ? "nc.match.yes" : "nc.match.no", { ip: nc.browserIp })]);
  }
  if (!compact) rows.push([t("row.ncCollected"), nc.collectedAt]);
  return rows;
}

function storageRows(acq) {
  if (acq.storageError) return [[t("row.error"), acq.storageError]];
  const s = acq.storage;
  if (!s) return [];
  const count = (n) => (n === null ? t("value.notAvailable") : String(n));
  return [
    [t("row.cookies"), t("storage.cookies", { n: s.cookies, httpOnly: s.httpOnly, thirdParty: s.thirdParty })],
    ["localStorage", count(s.local)],
    ["sessionStorage", count(s.session)],
    [t("row.storageValues"), t(s.valuesIncluded ? "storage.values.clear" : "storage.values.hash")],
    [t("row.file"), acq.storageFile]
  ];
}

// Sezioni comuni a report di testo e HTML (l'HTML mostra i file in tabella).
function reportSections(acq, { withFiles = true } = {}) {
  const sections = [
    [t("report.custody"), custodyRows(acq)],
    [t("report.page"), pageRows(acq)],
    [t("report.time"), timeRows(acq)],
    [t("report.env"), envRows(acq)]
  ];
  if (acq.features.network) sections.push([t("report.network"), networkRows(acq.network, acq.networkError)]);
  if (acq.features.netContext) sections.push([t("report.netContext"), netContextRows(acq.netContext, acq.netContextError)]);
  if (acq.features.storage) sections.push([t("report.storage"), storageRows(acq)]);
  if (acq.history?.length) sections.push([t("report.history"), historyRows(acq)]);
  if (acq.environment?.extensions?.length) sections.push([t("report.extensions"), extensionRows(acq)]);
  if (acq.timestamp) sections.push([t("report.timestamp"), [...timestampRows(acq.timestamp),
    [t("row.tsaQualified"), t(acq.tsaQualified ? "tsa.qualified.yes" : "tsa.qualified.no")]]]);
  if (withFiles) {
    sections.push([t("report.files"), acq.files.flatMap((f) => [
      [f.role, f.name],
      [`  ${t("row.fileSize")}`, t("value.bytes", { n: f.size })],
      ["  SHA-256", f.sha256]
    ])]);
  }
  return sections;
}

// Comandi di verifica, raggruppati: stessi testi nel report di testo e in HTML.
function verifyGroups(acq) {
  const groups = [
    { label: t("report.sha256sum"), indent: false, lines: acq.files.map((f) => `${f.sha256}  ${f.name}`) },
    { label: t("report.windows"), indent: true,
      lines: acq.files.map((f) => `Get-FileHash -Algorithm SHA256 -LiteralPath ${powershellLiteral(f.name)}`) }
  ];
  if (acq.timestamp && !acq.timestamp.error) {
    groups.push({ label: t("report.openssl"), indent: true, lines: [
      `openssl ts -reply -in ${shellLiteral(acq.timestamp.file)} -text`,
      `openssl ts -verify -data ${shellLiteral(acq.timestamp.target)} -in ${shellLiteral(acq.timestamp.file)} -CAfile tsa-ca.pem -untrusted tsa-chain.pem`,
      `sha256sum -c ${shellLiteral(acq.timestamp.target)}`
    ] });
  }
  return groups;
}

function verifyNote(acq) {
  return t(acq.timestamp && !acq.timestamp.error ? "report.note.tsa" : "report.note.clock");
}

function headerRows(acq) {
  const headers = acq.network?.document?.headers;
  return headers ? Object.entries(headers).map(([k, v]) => [cleanText(k), String(v).split("\n").map(cleanText).join(" | ")]) : [];
}

function buildReportText(acq) {
  const sections = reportSections(acq);

  // Colonna delle etichette larga quanto la più lunga, in ogni lingua.
  const width = Math.max(...sections.flatMap(([, rows]) => rows.map(([label]) => label.length))) + 2;
  const title = t("report.title");
  const lines = [title, "=".repeat(title.length), ""];
  const heading = (text) => lines.push(text, "-".repeat(text.length));
  for (const [name, rows] of sections) {
    heading(name);
    for (const [label, value] of rows) lines.push(`${(label + ":").padEnd(width)}${cleanText(value)}`);
    lines.push("");
  }

  const headers = acq.network?.document?.headers;
  if (headers) {
    heading(t("report.headers"));
    for (const [k, v] of Object.entries(headers)) {
      lines.push(`${cleanText(k)}: ${String(v).split("\n").map(cleanText).join("\r\n  ")}`);
    }
    lines.push("");
  }

  if (acq.log?.length) {
    heading(t("report.log"));
    lines.push(...logLines(acq.log), "", t("report.logNote"), "");
  }

  heading(t("report.verify"));
  verifyGroups(acq).forEach((g, i) => {
    if (i) lines.push("");
    lines.push(g.label, ...g.lines.map((l) => (g.indent ? `  ${l}` : l)));
  });
  lines.push("", ...verifyNote(acq).split("\n"));
  return lines.join("\r\n") + "\r\n";
}

// Dati per il report HTML (lib/reporthtml.js).
function buildReportHtmlModel(acq, warnings) {
  const d = acq.network?.document;
  const tls = acq.network?.tlsInterception;
  const main = acq.files[0];
  const chips = [{ label: `${acq.date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")}` }];
  chips.push(acq.timestamp && !acq.timestamp.error
    ? { label: t("html.chip.tsa"), tone: "ok" }
    : { label: t("html.chip.noTsa"), tone: "warn" });
  if (tls) chips.push(tls.status === "none" ? { label: t("html.chip.tlsOk"), tone: "ok" } : { label: t("html.chip.tlsBad"), tone: "bad" });
  if (acq.features.netContext) chips.push({ label: t("html.chip.netContext"), tone: acq.netContextError ? "warn" : "ok" });
  if (acq.features.storage) chips.push({ label: t(acq.storage?.valuesIncluded ? "html.chip.storageClear" : "html.chip.storage"),
    tone: acq.storage?.valuesIncluded ? "warn" : "ok" });
  chips.push(warnings.length ? { label: t("html.chip.warnings", { n: warnings.length }), tone: "warn" } : { label: t("html.chip.noWarnings"), tone: "ok" });

  const summary = [
    [t("html.tile.captured"), localIsoWithOffset(acq.date)],
    [t("html.tile.size"), t("row.size.value", { width: acq.width, height: acq.height })]
  ];
  if (d) summary.push([t("row.serverIp"), d.remoteIPAddress || t("value.notAvailable")], [t("row.httpResponse"), `${d.status} ${d.statusText || ""}`.trim()]);
  if (acq.custody?.caseRef) summary.push([t("row.caseRef"), acq.custody.caseRef]);
  if (main) summary.push([t("html.tile.mainHash"), main.sha256]);

  return {
    lang: currentLanguage,
    generator: acq.extension,
    id: acq.id,
    eyebrow: t("html.eyebrow"),
    title: t("report.title"),
    pageTitle: acq.title || acq.url,
    url: acq.url,
    chips,
    summary,
    warnings: warnings.map((w) => cleanText(tm(w))),
    sections: reportSections(acq, { withFiles: false }).map(([name, rows]) =>
      [name, rows.map(([label, value]) => [cleanText(label), cleanText(value)])]),
    files: acq.files.map((f) => ({ role: f.role, name: f.name, size: t("value.bytes", { n: f.size }), sha256: f.sha256 })),
    headers: headerRows(acq),
    log: (acq.log || []).map((e) => ({ at: e.at, step: e.step, detail: logLines([{ ...e, at: "", step: "" }])[0].trim() })),
    verify: verifyGroups(acq),
    verifyNotes: [verifyNote(acq).replace(/\n/g, " ")],
    footer: `${acq.extension} - ${t("row.codeFingerprint")}: ${acq.environment?.code?.sha256 || t("value.notAvailable")}`,
    labels: {
      warnings: t("html.warnings"), files: t("report.files"), fileRole: t("html.fileRole"), fileName: t("html.fileName"),
      fileSize: t("row.fileSize"), headers: t("report.headers"), log: t("report.log"), logNote: t("report.logNote"),
      verify: t("report.verify")
    }
  };
}

function buildReportJson(acq) {
  return JSON.stringify({
    schema: "full-page-screenshot/report@2",
    capturedAt: acq.date.toISOString(),
    capturedAtLocal: localIsoWithOffset(acq.date),
    timezone: acq.timezone,
    page: {
      url: acq.url,
      initialUrl: acq.initialUrl,
      title: acq.title,
      width: acq.width,
      height: acq.height,
      fullHeight: acq.fullHeight,
      emulatedWidth: acq.emulatedWidth || null
    },
    custody: acq.custody || null,
    environment: { userAgent: acq.userAgent, os: acq.environment?.os || null, extension: acq.extension,
      code: acq.environment?.code || null, extensions: acq.environment?.extensions || null },
    history: acq.history,
    netContext: acq.features.netContext ? (acq.netContext ? { file: `${acq.id}.netcontext.json`, host: acq.netContext.host,
      domain: acq.netContext.rdapDomain?.summary || null, ip: acq.netContext.rdapIp?.summary ? { address: acq.netContext.rdapIp.ip,
        source: acq.netContext.rdapIp.source, ...acq.netContext.rdapIp.summary } : null, browserIpInDns: acq.netContext.browserIpInDns }
      : { error: acq.netContextError || null }) : null,
    storage: acq.features.storage ? (acq.storage ? { file: acq.storageFile, ...acq.storage } : { error: acq.storageError || null }) : null,
    tsaQualified: acq.tsaQualified,
    options: { format: acq.format, ...acq.features },
    network: acq.features.network ? (acq.network || { error: acq.networkError }) : null,
    timestamp: acq.timestamp ? (({ tsr, ...rest }) => rest)(acq.timestamp) : null,
    language: currentLanguage,
    files: acq.files.map(({ name, type, role, size, sha256 }) => ({ name, type, role, size, sha256 })),
    log: acq.log || []
  }, null, 2);
}

// Avvio del download != completamento. Ascolta prima di avviarlo e controlla
// anche lo stato corrente, così non si perdono download completati subito.
function download(bytes, mime, filename, subfolder, timeoutMs = 120000, saveAs = false) {
  return new Promise((resolve, reject) => {
    let id;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      chrome.downloads.onChanged.removeListener(changed);
      chrome.downloads.onErased.removeListener(erased);
      error ? reject(error) : resolve(id);
    };
    const inspect = (item) => {
      if (item.state === "complete") {
        const actual = item.filename?.split(/[\\/]/).pop();
        if (!saveAs && actual && actual !== filename) finish(i18nError("err.download", { file: filename, error: "renamed" }));
        else finish();
      }
      else if (item.state === "interrupted") finish(i18nError("err.download", { file: filename, error: item.error || "interrupted" }));
    };
    const changed = (delta) => {
      if (delta.id !== id) return;
      if (delta.state?.current === "complete") void check();
      else inspect({ state: delta.state?.current, error: delta.error?.current });
    };
    const erased = (erasedId) => {
      if (erasedId === id) finish(i18nError("err.download", { file: filename, error: "removed" }));
    };
    const check = async () => {
      if (id === undefined || settled) return;
      try {
        const [item] = await chrome.downloads.search({ id });
        if (!item) finish(i18nError("err.download", { file: filename, error: "missing" }));
        else inspect(item);
      } catch (err) { finish(err); }
    };
    const timer = setTimeout(() => finish(i18nError("err.download", { file: filename, error: "timeout" })), timeoutMs);
    // Le chiamate API periodiche mantengono attivo il service worker MV3.
    const poll = setInterval(check, 5000);
    chrome.downloads.onChanged.addListener(changed);
    chrome.downloads.onErased.addListener(erased);
    Promise.resolve().then(() => chrome.downloads.download({
      url: `data:${mime};base64,${bytesToBase64(bytes)}`,
      filename: subfolder ? `${subfolder}/${filename}` : filename,
      saveAs,
      conflictAction: "uniquify"
    })).then((downloadId) => {
      id = downloadId;
      return check();
    }).catch(finish);
  });
}

// type è un codice stabile per il JSON; role è l'etichetta tradotta.
async function fileEntry(name, type, role, bytes, mime) {
  return { name, type, role, bytes, mime, size: bytes.length, sha256: await sha256Hex(bytes) };
}

async function run(tab, options = {}) {
  const settings = await getSettings();
  setLanguage(settings.language);
  const { features } = settings;
  const format = features.screenshot ? settings.format : null;
  if (![features.screenshot, features.mhtml, features.html, features.text, features.network,
    features.netContext, features.storage, features.textReport, features.jsonReport, features.htmlReport].some(Boolean)) {
    throw i18nError("err.noOutput");
  }

  // Catena di custodia: chi acquisisce, per quale caso e perché.
  const custody = cleanCustody(settings.custody);
  if (settings.advanced.custodyRequired && (!custody.operator || !custody.caseRef)) {
    throw i18nError("err.custodyMissing");
  }

  // Registro delle operazioni: ora UTC di ogni passo, incluso nei report e
  // quindi vincolato dal manifest e dalla marca temporale.
  const log = [];
  const step = (name, detail) => log.push({ at: new Date().toISOString(), step: name, ...(detail ? { detail } : {}) });
  step("acquisition.start", { operator: custody.operator || null, caseRef: custody.caseRef || null });
  const hasReport = features.textReport || features.jsonReport || features.htmlReport;
  const environment = hasReport || (format === "pdf" && features.cover) ? await collectEnvironment(settings) : {};
  step("environment", { code: environment.code?.sha256 || null,
    extensions: environment.extensions ? environment.extensions.length : null,
    canAlterPages: environment.extensions ? environment.extensions.filter((x) => x.canAlterPages).length : null });

  let tsaConfig = null;
  if (features.timestamp) {
    if (!settings.tsa.url) throw i18nError("err.tsaNotConfigured");
    const ok = await chrome.permissions.contains({ origins: [originPattern(settings.tsa.url)] });
    if (!ok) throw i18nError("err.tsaNoPermission");
    // Le credenziali stanno solo in memoria (vedi lib/vault.js).
    const secret = (await getSessionSecrets())?.[settings.tsa.preset] || {};
    const needsSecret = !!(settings.tsa.username || settings.tsa.headerName);
    if (needsSecret && !secret.password && !secret.headerValue) {
      throw i18nError(settings.secretMode === "encrypted" ? "err.tsaLocked" : "err.tsaMissing");
    }
    tsaConfig = { ...settings.tsa, ...secret };
  }

  const shot = await capture(tab, settings, { ...options, log: step });
  const manifest = chrome.runtime.getManifest();
  const withoutHash = (u) => String(u || "").split("#")[0];
  const urlChanged = withoutHash(shot.url) !== withoutHash(tab.url);
  const acq = {
    date: shot.date,
    url: redactUrl(shot.url),
    initialUrl: urlChanged ? redactUrl(tab.url) : null,
    title: cleanText(shot.title),
    width: shot.width,
    height: shot.height,
    fullHeight: shot.fullHeight || null,
    emulatedWidth: format ? Number(settings.width) || 0 : 0,
    format,
    features,
    userAgent: (await browserName()) + " — " + navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    extension: `${manifest.name} ${manifest.version}`,
    network: shot.network,
    networkError: shot.networkError,
    files: [],
    timestamp: null,
    custody,
    log,
    environment,
    history: shot.history || null,
    tsaQualified: !!TSA_PRESETS[settings.tsa.preset]?.qualified
  };

  const base = `capture_${fileTimestamp(shot.date)}_${crypto.randomUUID()}`;
  acq.id = base;

  // Contesto di rete esterno, a pagina già acquisita: titolari di dominio e
  // rete del server, risoluzione DNS. Contatta servizi terzi (vedi lib/netcontext.js).
  if (features.netContext) {
    let pageUrl = null;
    try { pageUrl = new URL(shot.url); } catch (_) {}
    if (pageUrl && /^https?:$/.test(pageUrl.protocol)) {
      step("netcontext.start", { host: pageUrl.hostname, dns: settings.advanced.dohProvider });
      try {
        acq.netContext = await collectNetContext(pageUrl.href, {
          browserIp: shot.network?.document?.remoteIPAddress || "", provider: settings.advanced.dohProvider
        });
        const nc = acq.netContext;
        step("netcontext.done", { domain: nc.rdapDomain?.summary ? nc.rdapDomain.query : (nc.rdapDomain?.unavailable || nc.rdapDomain?.error || null),
          ip: nc.rdapIp?.ip || null, dnsAnswered: nc.dns.filter((q) => !q.error).length, browserIpInDns: nc.browserIpInDns });
      } catch (err) {
        acq.netContextError = err.message;
        step("netcontext.error", { error: err.message });
      }
    } else {
      acq.netContextError = t("nc.notWeb");
    }
  }

  // Cookie e storage: i valori diventano impronte, salvo scelta esplicita.
  if (shot.browserState) {
    const state = await buildBrowserState(shot.browserState, {
      pageUrl: acq.url, includeValues: !!settings.advanced.storageValues, collectedAt: shot.browserState.at
    });
    delete shot.browserState;
    acq.storage = browserStateSummary(state);
    acq.storageState = state;
  } else if (shot.storageError) {
    acq.storageError = shot.storageError;
  }

  const related = [];
  if (shot.mhtml) related.push(await fileEntry(`${base}.mhtml`, "mhtml", t("role.mhtml"), shot.mhtml, "multipart/related"));
  if (shot.html) related.push(await fileEntry(`${base}.html`, "html", t("role.html"), shot.html, "text/html;charset=utf-8"));
  if (shot.harEntries) {
    const har = buildHar(shot.harEntries, { creator: manifest.name, version: manifest.version,
      pageTitle: acq.title, collection: shot.network?.harCollection,
      startedAt: shot.network?.harCollection?.startedAt || shot.date.toISOString(), redacted: t("value.redacted") });
    related.push(await fileEntry(`${base}.har`, "har", t("role.har"), new TextEncoder().encode(JSON.stringify(har)), "application/json"));
  }
  if (shot.text) {
    related.push(await fileEntry(`${base}.text.txt`, "text", t("role.text"),
      new TextEncoder().encode(buildTextFile(acq, shot.text)), "text/plain;charset=utf-8"));
  }
  if (acq.netContext) {
    related.push(await fileEntry(`${base}.netcontext.json`, "netcontext", t("role.netContext"),
      new TextEncoder().encode(JSON.stringify(acq.netContext, null, 2)), "application/json"));
  }
  if (acq.storageState) {
    acq.storageFile = `${base}.storage.json`;
    related.push(await fileEntry(acq.storageFile, "storage", t("role.storage"),
      new TextEncoder().encode(JSON.stringify(acq.storageState, null, 2)), "application/json"));
    delete acq.storageState;
  }
  if (shot.chainPem && acq.network?.certificate) {
    acq.network.certificate.file = `${base}.cert.pem`;
    related.push(await fileEntry(`${base}.cert.pem`, "certificate", t("role.cert"),
      new TextEncoder().encode(shot.chainPem), "application/x-pem-file"));
  }

  let main, printEntry = null;
  if (format === "pdf") {
    const pdf = buildPdf({
      jpeg: shot.image,
      cssWidth: shot.width,
      cssHeight: shot.height,
      info: { title: acq.title, url: acq.url, creator: acq.extension, date: shot.date },
      cover: features.cover ? buildCover(acq, related) : null
    });
    main = await fileEntry(`${base}.pdf`, "screenshot", t("role.pdf"), pdf.bytes, "application/pdf");
    // Copia A4 per la stampa, derivata dallo stesso JPEG: ogni foglio riporta
    // nome e impronta del PDF digitale, che resta il reperto di riferimento.
    if (features.printPdf) {
      const printPdf = buildPdf({
        jpeg: shot.image,
        cssWidth: shot.width,
        cssHeight: shot.height,
        info: { title: acq.title, url: acq.url, creator: acq.extension, date: shot.date },
        cover: features.cover ? buildCover(acq, related) : null,
        print: {
          landscape: settings.advanced.printOrientation === "landscape",
          header: acq.title || acq.url,
          pageLabel: (i, total) => t("print.page", { n: i, total }),
          footer: [
            `${acq.url}  -  ${shot.date.toISOString()}`,
            t("print.footer", { file: main.name, hash: main.sha256 })
          ]
        }
      });
      printEntry = await fileEntry(`${base}.print.pdf`, "print", t("role.printPdf"), printPdf.bytes, "application/pdf");
    }
  } else if (format) {
    const ext = format === "jpeg" ? "jpg" : "png";
    main = await fileEntry(`${base}.${ext}`, "screenshot", t("role.image", { format: format.toUpperCase() }), shot.image, `image/${format}`);
  }
  if (printEntry) related.push(printEntry);
  if (main) acq.files.push(main);
  acq.files.push(...related);
  for (const f of acq.files) step("evidence.hash", { file: f.name, sha256: f.sha256 });

  const outputs = [...acq.files];
  const warnings = [];
  const notes = [];

  // Il report descrive la richiesta. L'esito va in un file separato, perché
  // il report stesso viene vincolato dal manifest prima della richiesta TSA.
  if (features.timestamp) acq.timestamp = {
    status: "requested", verification: "not-verified", url: tsaConfig.url,
    target: `${base}.manifest.sha256`, file: `${base}.tsr`,
    receipt: `${base}.timestamp.json`
  };
  if (shot.networkError) warnings.push(msg("warn.network", { error: shot.networkError }));
  if (shot.textError) warnings.push(msg("warn.text", { error: shot.textError }));
  if (acq.netContextError) warnings.push(msg("warn.netContext", { error: acq.netContextError }));
  if (acq.storageError) warnings.push(msg("warn.storage", { error: acq.storageError }));
  if (acq.storage?.valuesIncluded) warnings.push(msg("warn.storageValues"));
  const harCollection = shot.network?.harCollection;
  if (harCollection && (harCollection.pending || harCollection.droppedRequests || harCollection.loadTimedOut)) {
    warnings.push(msg("warn.harIncomplete", harCollection));
  }
  const tls = shot.network?.tlsInterception;
  if (tls && tls.status !== "none") {
    warnings.push(msg("warn.tlsInterception", { issuer: tls.product || tls.issuer }));
  } else if (tls && options.afterInterception) {
    notes.push(msg("note.tlsClean"));
  }
  if (urlChanged) warnings.push(msg("warn.urlChanged", { url: acq.url }));
  const altering = (environment.extensions || []).filter((x) => x.canAlterPages);
  if (altering.length) warnings.push(msg("warn.extensions", { n: altering.length, names: altering.slice(0, 3).map((x) => x.name).join(", ") }));
  if (environment.extensionsError) warnings.push(msg("warn.extensionsUnavailable"));
  if (shot.fullHeight) warnings.push(msg("warn.truncated", { height: shot.height, full: shot.fullHeight }));
  const skew = shot.network?.clockSkewSeconds;
  if (Number.isFinite(skew) && Math.abs(skew) > 10) {
    warnings.push(msg("warn.clock", { direction: msg(skew > 0 ? "clock.behind" : "clock.ahead"), seconds: Math.abs(skew) }));
  }

  const enc = new TextEncoder();
  // Ultimo passo registrabile nei report: quelli successivi (manifest, TSA)
  // finiscono nella ricevuta della marca temporale.
  if (hasReport) step("report.build");
  if (features.textReport) {
    outputs.push({ name: `${base}.report.txt`, bytes: enc.encode(buildReportText(acq)), mime: "text/plain;charset=utf-8" });
  }
  if (features.jsonReport) {
    outputs.push({ name: `${base}.report.json`, bytes: enc.encode(buildReportJson(acq)), mime: "application/json" });
  }
  if (features.htmlReport) {
    outputs.push({ name: `${base}.report.html`, bytes: enc.encode(buildReportHtml(buildReportHtmlModel(acq, warnings))),
      mime: "text/html;charset=utf-8" });
  }

  // Manifest immutabile: tutti i reperti e i report, senza token o ricevute
  // che ancora non esistono. La TSA marca questo file, non solo lo screenshot.
  const checksums = async (files) => (await Promise.all(files.map(async (f) =>
    `${await sha256Hex(f.bytes)}  ${f.name}`))).join("\n") + "\n";
  if (!outputs.length) throw i18nError("err.noOutput");
  const primary = outputs[0];
  const primaryHash = primary.sha256 || await sha256Hex(primary.bytes);
  let evidenceManifest;
  if (features.checksums || features.timestamp || features.pec) {
    evidenceManifest = {
      name: `${base}.manifest.sha256`,
      bytes: enc.encode(await checksums(outputs)), mime: "text/plain;charset=utf-8"
    };
    outputs.push(evidenceManifest);
  }

  const receiptLog = [];
  const late = (name, detail) => receiptLog.push({ at: new Date().toISOString(), step: name, ...(detail ? { detail } : {}) });
  if (features.timestamp) {
    const targetHash = await sha256Hex(evidenceManifest.bytes);
    late("manifest.build", { sha256: targetHash });
    late("tsa.request", { url: tsaConfig.url });
    try {
      const ts = await requestTimestamp(await sha256Bytes(evidenceManifest.bytes), tsaConfig);
      acq.timestamp = { ...acq.timestamp, ...ts, targetSha256: targetHash };
      outputs.push({ name: `${base}.tsr`, bytes: ts.tsr, mime: "application/timestamp-reply" });
      acq.timestamp.verificationText = timestampCheckMessage(ts);
      // Solo una marca verificata non genera avviso.
      if (ts.verification === "verified") notes.push(timestampCheckMsg(ts));
      else warnings.push(timestampCheckMsg(ts));
    } catch (err) {
      acq.timestamp = { ...acq.timestamp, status: "failed", error: err.message, targetSha256: targetHash };
      warnings.push(msg("warn.tsa", { error: err.message }));
    }
    const { tsr, ...timestampResult } = acq.timestamp;
    late(acq.timestamp.status === "failed" ? "tsa.failed" : "tsa.response", acq.timestamp.status === "failed"
      ? { error: acq.timestamp.error } : { status: acq.timestamp.status, verification: acq.timestamp.verification, genTime: acq.timestamp.genTime });
    const receipt = { schema: "full-page-screenshot/timestamp@1", ...timestampResult, log: receiptLog };
    outputs.push({ name: `${base}.timestamp.json`, bytes: enc.encode(JSON.stringify(receipt, null, 2)), mime: "application/json" });
  }

  // La bozza PEC fa parte dell'esportazione, fuori dal manifest probatorio.
  if (features.pec) {
    const report = outputs.find((f) => f.name === `${base}.report.txt`);
    const manifestHash = await sha256Hex(evidenceManifest.bytes);
    let host = "";
    try { host = new URL(acq.url).hostname; } catch (_) {}
    const pecDraft = {
      name: `${base}.pec.eml`, mime: "message/rfc822",
      bytes: buildEml({
        to: settings.advanced.pecRecipient,
        subject: t("pec.subject", { host: host || acq.url, date: acq.date.toISOString() }),
        body: t("pec.body", {
          url: acq.url, date: acq.date.toISOString(), id: base,
          caseRef: custody.caseRef || t("custody.notGiven"), operator: custody.operator || t("custody.notGiven"),
          manifest: evidenceManifest.name, manifestHash, main: primary.name, mainHash: primaryHash,
          tsa: t(acq.timestamp && acq.timestamp.status !== "failed" ? "pec.body.tsa" : "pec.body.noTsa")
        }),
        attachments: [evidenceManifest, report].filter(Boolean)
      })
    };
    outputs.push(pecDraft);
    notes.push(msg("note.pec", { file: pecDraft.name }));
  }

  if (features.checksums) {
    outputs.push({ name: "SHA256SUMS.txt", bytes: enc.encode(await checksums(outputs)), mime: "text/plain;charset=utf-8" });
  }

  // Una sola richiesta di destinazione, anche con la conferma dei download attiva in Chrome.
  const subfolder = cleanSubfolder(settings.advanced.subfolder);
  const useZip = features.zip || outputs.length > 1;
  let zipHash = null;
  if (useZip) {
    const zip = makeZip(outputs, shot.date);
    zipHash = await sha256Hex(zip);
    await download(zip, "application/zip", `${base}.zip`, subfolder, undefined, true);
  } else {
    await download(primary.bytes, primary.mime, primary.name, subfolder, undefined, true);
  }

  return {
    width: shot.width,
    height: shot.height,
    filename: primary.name,
    hash: primaryHash,
    zipHash,
    genTime: acq.timestamp?.genTime || null,
    timestampVerification: acq.timestamp?.verification || null,
    notes,
    warnings
  };
}

// Lo stato dell'ultima cattura resta in storage.session: se il popup si chiude
// durante la cattura, riaprendolo si vedono comunque esito, hash e avvisi.
function setCaptureState(state) {
  return chrome.storage.session.set({ capture: { ...state, updatedAt: Date.now() } });
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

// Nome e versione del browser per il report. Edge si riconosce dai brand di
// userAgentData; Brave si presenta come Chrome ed espone navigator.brave.
async function browserName() {
  let name = "Chromium";
  try {
    if (navigator.brave && await navigator.brave.isBrave()) name = "Brave";
  } catch (_) {}
  const brands = navigator.userAgentData?.brands || [];
  const pick = (re) => brands.find((b) => re.test(b.brand));
  const known = pick(/Microsoft Edge/) || pick(/Opera/) || pick(/Brave/) || pick(/Google Chrome/) || pick(/Chromium/);
  if (name === "Brave") return `Brave ${(pick(/Chromium/) || known)?.version || ""}`.trim();
  if (known) return `${known.brand} ${known.version}`;
  const edge = navigator.userAgent.match(/Edg\/([\d.]+)/);
  return edge ? `Microsoft Edge ${edge[1]}` : name;
}

let busy = false;

// Accetta comandi solo dal popup dell'azione: stessa estensione, percorso
// esatto (senza query/fragment) e nessuna scheda associata (il popup aperto
// come scheda normale ha sender.tab).
function isPopupSender(sender) {
  if (sender?.id !== chrome.runtime.id || sender.tab) return false;
  try {
    const u = new URL(sender.url), p = new URL(chrome.runtime.getURL("popup.html"));
    return u.origin === p.origin && u.pathname === p.pathname && !u.search && !u.hash;
  } catch (_) { return false; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isPopupSender(sender)) return;
  if (message?.type !== "capture") return;

  if (busy) {
    sendResponse({ ok: false, busy: true, error: t("err.busy") });
    return;
  }
  busy = true;

  (async () => {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !isCapturableUrl(tab.url)) {
        throw i18nError("err.internalPage");
      }
      await setCaptureState({ status: "running", title: tab.title || "", url: tab.url || "" });
      setBadge("…", "#1a73e8");
      // Ricorda tra una cattura e l'altra che è stata rilevata un'intercettazione,
      // per ricordare di riattivare la protezione a cattura pulita.
      const { tlsSeen } = await chrome.storage.session.get("tlsSeen");
      const result = await run(tab, { override: message.override === true, afterInterception: !!tlsSeen });
      if (tlsSeen) await chrome.storage.session.remove("tlsSeen");
      await setCaptureState({ status: "done", title: tab.title || "", url: tab.url || "", ...result });
      setBadge(result.warnings.length ? "!" : "OK", result.warnings.length ? "#e37400" : "#188038");
      sendResponse({ ok: true, ...result });
    } catch (err) {
      const error = err?.message || String(err);
      if (err?.code === "tls.interception") {
        await chrome.storage.session.set({ tlsSeen: true });
        await setCaptureState({ status: "interception", title: tab?.title || "", url: tab?.url || "", error, interception: err.info });
        setBadge("!", "#e37400");
        sendResponse({ ok: false, interception: err.info, error });
        return;
      }
      await setCaptureState({ status: "error", title: tab?.title || "", url: tab?.url || "", error,
        errorMsg: err?.code && I18N.en[err.code] ? msg(err.code, err.params || {}) : null });
      setBadge("ERR", "#d93025");
      sendResponse({ ok: false, error });
    } finally {
      busy = false;
    }
  })();

  return true; // risposta asincrona
});

