// Credenziali della marca temporale (password e valore dell'header).
//
// Non vengono mai salvate in chiaro su disco. Durante l'uso stanno in
// chrome.storage.session (solo in memoria, accessibile solo alle pagine
// dell'estensione, cancellato alla chiusura del browser). In modalità
// "cifrata" una copia resta su disco cifrata con AES-256-GCM, con chiave
// derivata da una password di protezione tramite PBKDF2-SHA256.

const VAULT_ITERATIONS = 600000;
const VAULT_MIN_PASSWORD = 8;
const SECRET_FIELDS = ["password", "headerValue"];

async function deriveVaultKey(password, salt, iterations = VAULT_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encryptSecrets(secrets, key, salt, iterations = VAULT_ITERATIONS) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(secrets));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(data)
  };
}

async function decryptSecrets(vault, key) {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (_) {
    throw i18nError("vault.wrongPassword");
  }
}

async function exportVaultKey(key) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

function importVaultKey(b64) {
  return crypto.subtle.importKey("raw", base64ToBytes(b64), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

async function getVault() {
  const { tsaVault } = await chrome.storage.local.get("tsaVault");
  return tsaVault || null;
}

// Credenziali in memoria per questa sessione del browser: { preset: { password, headerValue } }.
async function getSessionSecrets() {
  const { tsaSecrets } = await chrome.storage.session.get("tsaSecrets");
  return tsaSecrets || null;
}

function hasSecrets(secrets) {
  return Object.values(secrets || {}).some((s) => SECRET_FIELDS.some((f) => s?.[f]));
}

// Le versioni precedenti salvavano password e header in chiaro: li sposta in
// memoria e li cancella dal disco.
async function migratePlaintextSecrets() {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) return false;
  const moved = {};
  const strip = (preset, obj) => {
    if (!obj) return;
    for (const f of SECRET_FIELDS) {
      if (obj[f]) (moved[preset] ||= {})[f] = obj[f];
      delete obj[f];
    }
  };
  strip(settings.tsa?.preset || "custom", settings.tsa);
  for (const [preset, profile] of Object.entries(settings.tsaProfiles || {})) strip(preset, profile);
  if (!Object.keys(moved).length) return false;
  const current = (await getSessionSecrets()) || {};
  for (const [preset, s] of Object.entries(moved)) current[preset] = { ...s, ...current[preset] };
  await chrome.storage.session.set({ tsaSecrets: current });
  await chrome.storage.local.set({ settings });
  return true;
}
