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
    policyOid: ""
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
    subfolder: ""
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
