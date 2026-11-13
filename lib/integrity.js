// Integrità dell'ambiente di acquisizione.
//
// 1. Impronta del codice dell'estensione: SHA-256 di ogni file del pacchetto
//    e un'impronta complessiva, confrontabile con quella stampata da
//    tools/build.py per la release ufficiale.
// 2. Altre estensioni attive (permesso facoltativo "management"): quelle che
//    possono leggere o modificare le pagine potrebbero aver alterato quanto
//    mostrato durante l'acquisizione.

// Elenco dei file del pacchetto con codice o testi (le icone non influiscono
// sul comportamento). Un test controlla che corrisponda ai file su disco.
const EXTENSION_CODE_FILES = [
  "manifest.json", "background.js", "popup.html", "popup.js", "options.html", "options.js", "ui.css",
  "lib/common.js", "lib/cookies.js", "lib/eml.js", "lib/har.js", "lib/i18n.js", "lib/integrity.js", "lib/netcontext.js",
  "lib/pdf.js", "lib/reporthtml.js", "lib/tsa.js",
  "lib/tsaroots.js", "lib/tsaverify.js", "lib/updates.js", "lib/vault.js", "lib/zip.js",
  "lib/locales/en.js", "lib/locales/es.js", "lib/locales/fr.js", "lib/locales/it.js",
  "_locales/en/messages.json", "_locales/es/messages.json", "_locales/fr/messages.json", "_locales/it/messages.json"
];

// Impronta complessiva: SHA-256 delle righe "<sha256>  <file>\n" in ordine.
async function codeFingerprint(readFile) {
  const files = [];
  for (const name of EXTENSION_CODE_FILES) {
    const bytes = await readFile(name);
    files.push({ name, sha256: await sha256Hex(bytes) });
  }
  const listing = files.map((f) => `${f.sha256}  ${f.name}\n`).join("");
  return { sha256: await sha256Hex(new TextEncoder().encode(listing)), files };
}

async function readPackageFile(name) {
  const res = await fetch(chrome.runtime.getURL(name));
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Permessi che consentono di leggere o modificare il contenuto delle pagine.
const PAGE_ACCESS_PERMISSIONS = ["debugger", "webRequest", "webRequestBlocking", "declarativeNetRequest", "proxy", "scripting", "tabs"];

function describeExtensions(list, selfId) {
  return (list || [])
    .filter((x) => x.enabled && x.id !== selfId && x.type === "extension")
    .map((x) => {
      const hosts = x.hostPermissions || [];
      const allSites = hosts.some((h) => h === "<all_urls>" || /^\*:\/\/\*\/\*$|^https?:\/\/\*\/\*$/.test(h));
      const sensitive = (x.permissions || []).filter((p) => PAGE_ACCESS_PERMISSIONS.includes(p));
      return {
        id: x.id, name: cleanText(x.name), version: x.version, installType: x.installType,
        allSites, sensitive, canAlterPages: allSites || sensitive.includes("debugger") || sensitive.includes("proxy")
      };
    })
    .sort((a, b) => Number(b.canAlterPages) - Number(a.canAlterPages) || a.name.localeCompare(b.name));
}

const OS_NAMES = { win: "Windows", mac: "macOS", linux: "Linux", cros: "ChromeOS", android: "Android", openbsd: "OpenBSD", fuchsia: "Fuchsia" };

async function collectEnvironment(settings) {
  const env = { os: null, code: null, extensions: null, extensionsError: null };
  try {
    env.code = await codeFingerprint(readPackageFile);
  } catch (err) {
    env.codeError = err.message;
  }
  // Sistema operativo e architettura, come li riporta il browser.
  try {
    const { os, arch } = await chrome.runtime.getPlatformInfo();
    env.os = `${OS_NAMES[os] || os} ${arch}`;
  } catch (_) {}
  if (settings.advanced.listExtensions) {
    try {
      const ok = await chrome.permissions.contains({ permissions: ["management"] });
      if (!ok) throw new Error("management permission not granted");
      env.extensions = describeExtensions(await chrome.management.getAll(), chrome.runtime.id);
    } catch (err) {
      env.extensionsError = err.message;
    }
  }
  return env;
}
