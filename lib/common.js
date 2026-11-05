// Funzioni e impostazioni condivise tra service worker, popup e opzioni.

// Il nome visualizzato è la chiave di traduzione "preset.<chiave>".
const TSA_PRESETS = {
  freetsa: { url: "https://freetsa.org/tsr" },
  digicert: { url: "http://timestamp.digicert.com" },
  sectigo: { url: "http://timestamp.sectigo.com" },
  aruba: { url: "https://servizi.arubapec.it/tsa/ngrequest.php" },
  custom: { url: "" }
};

const DEFAULT_SETTINGS = {
  language: "auto",
  width: 0,
  format: "pdf",
  features: {
    cover: true,
    printPdf: false,
    autoScroll: false,
    mhtml: false,
    html: false,
    network: false,
    timestamp: false,
    jsonReport: false,
    zip: false
  },
  // Password e valore dell'header non stanno qui: vedi lib/vault.js.
  tsa: {
    preset: "freetsa",
    url: TSA_PRESETS.freetsa.url,
    username: "",
    headerName: "",
    policyOid: "",
    caPem: ""
  },
  secretMode: "session",
  // Configurazione salvata per ogni servizio, così le credenziali di un
  // servizio non finiscono mai a un altro quando si cambia selezione.
  tsaProfiles: {},
  advanced: {
    jpegQuality: 92,
    settleDelay: 700,
    loadTimeout: 30000,
    maxHeight: 50000,
    subfolder: "",
    // Ferma la cattura se la connessione TLS risulta ispezionata da software
    // locale (antivirus, VPN, proxy aziendale). Richiede i dati di rete.
    tlsCheck: true,
    // Orientamento della copia per la stampa: portrait | landscape.
    printOrientation: "portrait"
  }
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    features: { ...DEFAULT_SETTINGS.features, ...s.features },
    tsa: { ...DEFAULT_SETTINGS.tsa, ...s.tsa },
    tsaProfiles: { ...s.tsaProfiles },
    advanced: { ...DEFAULT_SETTINGS.advanced, ...s.advanced }
  };
}

function saveSettings(settings) {
  return chrome.storage.local.set({ settings });
}

// Legge le impostazioni più recenti, applica la modifica e salva: evita di
// sovrascrivere cambiamenti fatti nel frattempo da un'altra pagina.
async function updateSettings(mutate) {
  const settings = await getSettings();
  mutate(settings);
  await saveSettings(settings);
  return settings;
}

// Sottocartella di Download sicura: niente percorsi assoluti né "..".
function cleanSubfolder(value) {
  return String(value || "")
    .split(/[\\/]+/)
    .map((part) => part.replace(/[<>:"|?*\x00-\x1f]+/g, "_").trim().replace(/[. ]+$/, ""))
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

// Pattern di permesso host per l'URL del servizio di marca temporale.
function originPattern(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

// Si catturano solo pagine web e file locali: tutto il resto (pagine interne,
// view-source:, data:, blob:, schemi di altri browser) viene rifiutato.
const CAPTURABLE_PROTOCOLS = ["http:", "https:", "file:"];
function isCapturableUrl(url) {
  try { return CAPTURABLE_PROTOCOLS.includes(new URL(url).protocol); } catch (_) { return false; }
}

// Emittenti di certificati generati al volo da software che ispeziona HTTPS.
// Servono a dare un nome all'avviso; l'altro segnale forte sono gli SCT mancanti.
const TLS_INTERCEPTORS = [
  [/NordVPN|Threat ?Protection/i, "NordVPN Threat Protection"],
  [/Kaspersky/i, "Kaspersky"],
  [/Avast|\bAVG\b/i, "Avast/AVG"],
  [/\bESET\b/i, "ESET"],
  [/Bitdefender/i, "Bitdefender"],
  [/Norton|Gen Digital/i, "Norton"],
  [/McAfee/i, "McAfee"],
  [/Sophos/i, "Sophos"],
  [/Trend ?Micro/i, "Trend Micro"],
  [/Dr\.? ?Web/i, "Dr.Web"],
  [/Surfshark|CleanWeb/i, "Surfshark"],
  [/Zscaler/i, "Zscaler"],
  [/Fortinet|FortiGate/i, "Fortinet"],
  [/Palo Alto/i, "Palo Alto Networks"],
  [/Netskope/i, "Netskope"],
  [/Cisco Umbrella|OpenDNS/i, "Cisco Umbrella"],
  [/Cloudflare (Gateway|for Teams)/i, "Cloudflare Gateway"],
  [/Forcepoint|Websense/i, "Forcepoint"],
  [/Blue ?Coat/i, "Blue Coat"],
  [/Check ?Point/i, "Check Point"],
  [/Barracuda/i, "Barracuda"],
  [/WatchGuard/i, "WatchGuard"],
  [/Fiddler|Charles Proxy|mitmproxy|PortSwigger/i, "debugging proxy"]
];
const FRESH_CERT_MS = 24 * 3600 * 1000;

// Valuta se il certificato del documento è stato emesso da una CA locale.
// security: { issuer, validFrom (ISO), sctCount, ctCompliance }.
// Esito: none | suspected | likely, con i segnali che lo motivano.
function detectTlsInterception(security, capturedAtMs = Date.now()) {
  if (!security) return { status: "none", signals: [], issuer: "", product: null };
  const signals = [];
  const issuer = String(security.issuer || "");
  const known = TLS_INTERCEPTORS.find(([re]) => re.test(issuer));
  if (known) signals.push("known-issuer");
  // Chrome non richiede la Certificate Transparency per le root installate
  // localmente: un certificato senza SCT è quasi sempre intercettato.
  const noSct = security.sctCount === 0 && security.ctCompliance !== "compliant";
  if (noSct) signals.push("no-sct");
  const from = Date.parse(security.validFrom || "");
  const age = capturedAtMs - from;
  if (Number.isFinite(age) && age >= 0 && age < FRESH_CERT_MS) signals.push("fresh-cert");
  // Un certificato appena emesso da solo è normale (rinnovi automatici).
  const status = known || (noSct && signals.includes("fresh-cert")) ? "likely" : noSct ? "suspected" : "none";
  return { status, signals: status === "none" ? [] : signals, issuer, product: known ? known[1] : null };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function fileTimestamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function localIsoWithOffset(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function sha256Hex(bytes) {
  return toHex(await sha256Bytes(bytes));
}
