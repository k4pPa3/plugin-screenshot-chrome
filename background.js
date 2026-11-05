// Usa il Chrome DevTools Protocol, lo stesso meccanismo di
// "Capture full size screenshot" in DevTools.

importScripts(
  "lib/i18n.js", "lib/locales/en.js", "lib/locales/it.js", "lib/locales/fr.js", "lib/locales/es.js",
  "lib/common.js", "lib/pdf.js", "lib/zip.js", "lib/tsa.js", "lib/vault.js"
);

// Aggiornando da una versione che salvava le credenziali in chiaro, le toglie dal disco.
chrome.runtime.onInstalled.addListener(() => { migratePlaintextSecrets().catch(() => {}); });

// Lingua di messaggi e report: segue l'impostazione, anche quando cambia.
getSettings().then((s) => setLanguage(s.language));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) setLanguage(changes.settings.newValue?.language);
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

function isoFromSeconds(s) {
  return typeof s === "number" ? new Date(s * 1000).toISOString() : "";
}

// Ricarica la pagina con il debugger attivo per registrare risposta HTTP,
// indirizzo IP del server, catena di redirect e certificato TLS.
async function collectNetworkInfo(target, settings) {
  const { frameTree } = await send(target, "Page.getFrameTree");
  const mainFrame = frameTree.frame.id;
  const net = { redirects: [], document: null, certificate: null };

  let onLoad;
  const loaded = new Promise((r) => { onLoad = r; });
  const listener = (source, method, params) => {
    if (source.tabId !== target.tabId) return;
    if (method === "Page.loadEventFired") onLoad();
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
          validTo: isoFromSeconds(r.securityDetails.validTo)
        } : null
      };
    }
  };

  chrome.debugger.onEvent.addListener(listener);
  try {
    await send(target, "Network.enable");
    await send(target, "Network.setBypassServiceWorker", { bypass: true }).catch(() => {});
    await send(target, "Page.reload", { ignoreCache: true });
    await Promise.race([loaded, sleep(settings.advanced.loadTimeout)]);
    await sleep(1500);
  } finally {
    chrome.debugger.onEvent.removeListener(listener);
  }

  // Confronta l'orologio del PC con l'header Date del server (precisione 1 s).
  // Se la risposta arriva dalla cache di una CDN, Date è l'ora in cui l'ha
  // generata l'origine e Age dice da quanti secondi è in cache: l'ora del
  // server al momento della risposta è Date + Age.
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
      }
    } catch (_) {}
  }
  return net;
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

async function capture(tab, settings) {
  const { features, advanced } = settings;
  const width = Number(settings.width) || 0;
  const target = { tabId: tab.id };
  await chrome.debugger.attach(target, PROTOCOL_VERSION);

  const result = { network: null, networkError: null };
  try {
    await send(target, "Page.enable");

    if (features.network) {
      try {
        result.network = await collectNetworkInfo(target, settings);
      } catch (err) {
        result.networkError = err.message;
      }
    }
    // Dopo l'eventuale ricarica: il mondo isolato è legato al documento.
    const world = await createIsolatedWorld(target);
    if (features.autoScroll) await autoScroll(target, world, settings);

    const initial = await send(target, "Page.getLayoutMetrics");
    const viewport = initial.cssLayoutViewport || initial.layoutViewport;
    const pageWidth = Math.ceil(width || viewport.clientWidth);
    const mobile = !!width && width < 768;

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
    let pageHeight = await contentHeight();
    for (let i = 0; i < 3; i++) {
      await setViewport(pageHeight);
      await sleep(advanced.settleDelay);
      const h = await contentHeight();
      if (h <= pageHeight) break;
      pageHeight = h; // la pagina ha caricato altro contenuto
    }
    await evaluate(target, world, "window.scrollTo(0, 0)", 5000);
    await sleep(200);

    // Il PDF incorpora lo screenshot come JPEG.
    const imageFormat = settings.format === "png" ? "png" : "jpeg";
    const params = {
      format: imageFormat,
      captureBeyondViewport: true,
      fromSurface: true,
      clip: { x: 0, y: 0, width: pageWidth, height: pageHeight, scale: 1 }
    };
    if (imageFormat === "jpeg") params.quality = advanced.jpegQuality;

    result.date = new Date();
    const { data } = await send(target, "Page.captureScreenshot", params);
    result.image = base64ToBytes(data);
    result.width = pageWidth;
    result.height = pageHeight;

    // Indirizzo e titolo effettivi al momento dello screenshot: la pagina
    // potrebbe aver cambiato URL durante la cattura.
    const history = await send(target, "Page.getNavigationHistory");
    const entry = history.entries[history.currentIndex] || {};
    result.url = entry.url || tab.url || "";
    result.title = entry.title || tab.title || "";

    if (features.mhtml) {
      const { data: mhtml } = await send(target, "Page.captureSnapshot", { format: "mhtml" });
      result.mhtml = new TextEncoder().encode(mhtml);
    }
    if (features.html) {
      const html = await evaluate(target, world,
        `(document.doctype ? new XMLSerializer().serializeToString(document.doctype) + "\\n" : "") + document.documentElement.outerHTML`,
        30000);
      result.html = new TextEncoder().encode(protectHtml(String(html)));
    }
  } finally {
    try {
      await send(target, "Emulation.clearDeviceMetricsOverride");
    } catch (_) {}
    try {
      await chrome.debugger.detach(target);
    } catch (_) {}
  }
  return result;
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
  if (!net?.document) return [[t("row.status"), t("net.noDocument")]];
  const d = net.document;
  const rows = [
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
    if (s.sanList?.length) {
      const names = compact ? s.sanList.slice(0, COVER_MAX_SAN) : s.sanList;
      const more = s.sanList.length - names.length;
      rows.push([t("row.san"), names.join(", ") + (more ? ` ${t("cover.more", { n: more })}` : "")]);
    }
  }
  if (net.certificate) rows.push([t("row.certFingerprint"), `SHA-256 ${net.certificate.sha256}`]);
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
  return [
    [t("row.browser"), acq.userAgent],
    [t("row.extension"), acq.extension]
  ];
}

function buildCover(acq, relatedFiles) {
  const sections = [
    { title: t("cover.page"), rows: pageRows(acq) },
    { title: t("cover.time"), rows: timeRows(acq) },
    { title: t("cover.env"), rows: envRows(acq) }
  ];
  if (acq.features.network) {
    sections.push({ title: t("cover.network"), rows: networkRows(acq.network, acq.networkError, true) });
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
  return {
    title: t("cover.title"),
    subtitle: `${acq.extension} - ${localIsoWithOffset(acq.date)}`,
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

function buildReportText(acq) {
  const sections = [
    [t("report.page"), pageRows(acq)],
    [t("report.time"), timeRows(acq)],
    [t("report.env"), envRows(acq)]
  ];
  if (acq.features.network) sections.push([t("report.network"), networkRows(acq.network, acq.networkError)]);
  if (acq.timestamp) sections.push([t("report.timestamp"), timestampRows(acq.timestamp)]);
  sections.push([t("report.files"), acq.files.flatMap((f) => [
    [f.role, f.name],
    [`  ${t("row.fileSize")}`, t("value.bytes", { n: f.size })],
    ["  SHA-256", f.sha256]
  ])]);

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

  heading(t("report.verify"));
  lines.push(t("report.sha256sum"));
  for (const f of acq.files) lines.push(`${f.sha256}  ${f.name}`);
  lines.push("", t("report.windows"));
  for (const f of acq.files) lines.push(`  Get-FileHash -Algorithm SHA256 -LiteralPath ${powershellLiteral(f.name)}`);
  const timestampRequested = acq.timestamp && !acq.timestamp.error;
  if (timestampRequested) {
    lines.push(
      "",
      t("report.openssl"),
      `  openssl ts -reply -in ${shellLiteral(acq.timestamp.file)} -text`,
      `  openssl ts -verify -data ${shellLiteral(acq.timestamp.target)} -in ${shellLiteral(acq.timestamp.file)} -CAfile tsa-ca.pem -untrusted tsa-chain.pem`,
      `  sha256sum -c ${shellLiteral(acq.timestamp.target)}`
    );
  }
  lines.push("", ...t(timestampRequested ? "report.note.tsa" : "report.note.clock").split("\n"));
  return lines.join("\r\n") + "\r\n";
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
    environment: { userAgent: acq.userAgent, extension: acq.extension },
    options: { format: acq.format, ...acq.features },
    network: acq.features.network ? (acq.network || { error: acq.networkError }) : null,
    timestamp: acq.timestamp ? (({ tsr, ...rest }) => rest)(acq.timestamp) : null,
    language: currentLanguage,
    files: acq.files.map(({ name, type, role, size, sha256 }) => ({ name, type, role, size, sha256 }))
  }, null, 2);
}

// Avvio del download != completamento. Ascolta prima di avviarlo e controlla
// anche lo stato corrente, così non si perdono download completati subito.
function download(bytes, mime, filename, subfolder, timeoutMs = 120000) {
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
        if (actual && actual !== filename) finish(i18nError("err.download", { file: filename, error: "renamed" }));
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
      saveAs: false,
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

async function run(tab) {
  const settings = await getSettings();
  setLanguage(settings.language);
  const { features } = settings;
  const format = settings.format;

  let tsaConfig = null;
  if (features.timestamp) {
    if (!settings.tsa.url) throw new Error(t("err.tsaNotConfigured"));
    const ok = await chrome.permissions.contains({ origins: [originPattern(settings.tsa.url)] });
    if (!ok) throw new Error(t("err.tsaNoPermission"));
    // Le credenziali stanno solo in memoria (vedi lib/vault.js).
    const secret = (await getSessionSecrets())?.[settings.tsa.preset] || {};
    const needsSecret = !!(settings.tsa.username || settings.tsa.headerName);
    if (needsSecret && !secret.password && !secret.headerValue) {
      throw new Error(t(settings.secretMode === "encrypted" ? "err.tsaLocked" : "err.tsaMissing"));
    }
    tsaConfig = { ...settings.tsa, ...secret };
  }

  const shot = await capture(tab, settings);
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
    emulatedWidth: Number(settings.width) || 0,
    format,
    features,
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    extension: `${manifest.name} ${manifest.version}`,
    network: shot.network,
    networkError: shot.networkError,
    files: [],
    timestamp: null
  };

  const base = `capture_${fileTimestamp(shot.date)}_${crypto.randomUUID()}`;
  const related = [];
  if (shot.mhtml) related.push(await fileEntry(`${base}.mhtml`, "mhtml", t("role.mhtml"), shot.mhtml, "multipart/related"));
  if (shot.html) related.push(await fileEntry(`${base}.html`, "html", t("role.html"), shot.html, "text/html;charset=utf-8"));

  let main;
  if (format === "pdf") {
    const pdf = buildPdf({
      jpeg: shot.image,
      cssWidth: shot.width,
      cssHeight: shot.height,
      info: { title: acq.title, url: acq.url, creator: acq.extension, date: shot.date },
      cover: features.cover ? buildCover(acq, related) : null
    });
    main = await fileEntry(`${base}.pdf`, "screenshot", t("role.pdf"), pdf.bytes, "application/pdf");
  } else {
    const ext = format === "jpeg" ? "jpg" : "png";
    main = await fileEntry(`${base}.${ext}`, "screenshot", t("role.image", { format: format.toUpperCase() }), shot.image, `image/${format}`);
  }
  acq.files.push(main, ...related);

  const outputs = [main, ...related];
  const warnings = [];

  // Il report descrive la richiesta. L'esito va in un file separato, perché
  // il report stesso viene vincolato dal manifest prima della richiesta TSA.
  if (features.timestamp) acq.timestamp = {
    status: "requested", verification: "not-verified", url: tsaConfig.url,
    target: `${base}.manifest.sha256`, file: `${base}.tsr`,
    receipt: `${base}.timestamp.json`
  };
  if (shot.networkError) warnings.push(t("warn.network", { error: shot.networkError }));
  if (urlChanged) warnings.push(t("warn.urlChanged", { url: acq.url }));
  if (shot.fullHeight) warnings.push(t("warn.truncated", { height: shot.height, full: shot.fullHeight }));
  const skew = shot.network?.clockSkewSeconds;
  if (Number.isFinite(skew) && Math.abs(skew) > 10) {
    warnings.push(t("warn.clock", { direction: t(skew > 0 ? "clock.behind" : "clock.ahead"), seconds: Math.abs(skew) }));
  }

  const enc = new TextEncoder();
  outputs.push({ name: `${base}.report.txt`, bytes: enc.encode(buildReportText(acq)), mime: "text/plain;charset=utf-8" });
  if (features.jsonReport) {
    outputs.push({ name: `${base}.report.json`, bytes: enc.encode(buildReportJson(acq)), mime: "application/json" });
  }

  // Manifest immutabile: tutti i reperti e i report, senza token o ricevute
  // che ancora non esistono. La TSA marca questo file, non solo lo screenshot.
  const checksums = async (files) => (await Promise.all(files.map(async (f) =>
    `${await sha256Hex(f.bytes)}  ${f.name}`))).join("\n") + "\n";
  const evidenceManifest = {
    name: `${base}.manifest.sha256`,
    bytes: enc.encode(await checksums(outputs)), mime: "text/plain;charset=utf-8"
  };
  outputs.push(evidenceManifest);

  if (features.timestamp) {
    const targetHash = await sha256Hex(evidenceManifest.bytes);
    try {
      const ts = await requestTimestamp(await sha256Bytes(evidenceManifest.bytes), tsaConfig);
      acq.timestamp = { ...acq.timestamp, ...ts, targetSha256: targetHash };
      outputs.push({ name: `${base}.tsr`, bytes: ts.tsr, mime: "application/timestamp-reply" });
      warnings.push(t("tsa.unverified"));
    } catch (err) {
      acq.timestamp = { ...acq.timestamp, status: "failed", error: err.message, targetSha256: targetHash };
      warnings.push(t("warn.tsa", { error: err.message }));
    }
    const { tsr, ...timestampResult } = acq.timestamp;
    const receipt = { schema: "full-page-screenshot/timestamp@1", ...timestampResult };
    outputs.push({ name: `${base}.timestamp.json`, bytes: enc.encode(JSON.stringify(receipt, null, 2)), mime: "application/json" });
  }

  // Il riepilogo finale include anche manifest, token e ricevuta. Esclude solo
  // se stesso. Il manifest marcato protegge il contenuto probatorio e i report.
  outputs.push({ name: `${base}.SHA256SUMS.txt`, bytes: enc.encode(await checksums(outputs)), mime: "text/plain;charset=utf-8" });
  const subfolder = cleanSubfolder(settings.advanced.subfolder);
  let zipHash = null;
  if (features.zip) {
    // Nome convenzionale dentro lo ZIP; all'esterno usa l'ID acquisizione.
    outputs[outputs.length - 1].name = "SHA256SUMS.txt";
    const zip = makeZip(outputs, shot.date);
    zipHash = await sha256Hex(zip);
    await download(zip, "application/zip", `${base}.zip`, subfolder);
  } else {
    for (const f of outputs) await download(f.bytes, f.mime, f.name, subfolder);
  }

  return {
    width: shot.width,
    height: shot.height,
    filename: main.name,
    hash: main.sha256,
    zipHash,
    genTime: acq.timestamp?.genTime || null,
    timestampVerification: acq.timestamp?.verification || null,
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

let busy = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Accetta il comando solo dal popup di questa estensione.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL("popup.html"))) return;
  if (msg?.type !== "capture") return;

  if (busy) {
    sendResponse({ ok: false, busy: true, error: t("err.busy") });
    return;
  }
  busy = true;

  (async () => {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || /^(chrome|edge|about|chrome-extension|devtools):/.test(tab.url || "")) {
        throw new Error(t("err.internalPage"));
      }
      await setCaptureState({ status: "running", title: tab.title || "", url: tab.url || "" });
      setBadge("…", "#1a73e8");
      const result = await run(tab);
      await setCaptureState({ status: "done", title: tab.title || "", url: tab.url || "", ...result });
      setBadge(result.warnings.length ? "!" : "OK", result.warnings.length ? "#e37400" : "#188038");
      sendResponse({ ok: true, ...result });
    } catch (err) {
      const error = err?.message || String(err);
      await setCaptureState({ status: "error", title: tab?.title || "", url: tab?.url || "", error });
      setBadge("ERR", "#d93025");
      sendResponse({ ok: false, error });
    } finally {
      busy = false;
    }
  })();

  return true; // risposta asincrona
});

