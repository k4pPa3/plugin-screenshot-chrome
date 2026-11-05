const $ = (id) => document.getElementById(id);
const presetEl = $("tsaPreset");
const saveStatus = $("saveStatus");
// Campi salvati su disco; password e valore header sono gestiti da lib/vault.js.
const tsaFields = ["url", "username", "headerName", "policyOid", "caPem"];
const secretInputs = { password: "tsaPassword", headerValue: "tsaHeaderValue" };
const numberFields = {
  jpegQuality: { min: 1, max: 100 },
  settleDelay: { min: 0, max: 10000 },
  loadTimeout: { min: 1000, max: 120000 },
  maxHeight: { min: 1000, max: 200000 }
};

let settings;
let currentPreset;
let dirty = false;
let secrets = {};        // credenziali di tutti i servizi, in memoria
let vault = null;        // copia cifrata su disco (modalità "encrypted")
let vaultKey = null;     // chiave della sessione, se sbloccato
let locked = false;

// Testi che dipendono dalla lingua e non stanno in data-i18n.
function translatePage() {
  applyI18n();
  document.title = t("options.title");
  $("supportStatus").textContent = "";
  const selected = presetEl.value;
  presetEl.replaceChildren(...Object.keys(TSA_PRESETS).map((key) => new Option(t(`preset.${key}`), key)));
  if (selected) presetEl.value = selected;
  const languageEl = $("language");
  const chosen = languageEl.value || settings?.language || "auto";
  languageEl.replaceChildren(
    new Option(t("options.language.auto"), "auto"),
    ...Object.entries(LANGUAGES).map(([code, name]) => new Option(name, code))
  );
  languageEl.value = chosen;
}

function fieldId(name) {
  return "tsa" + name[0].toUpperCase() + name.slice(1);
}

function show(el, text, cls) {
  el.textContent = text;
  el.className = cls || "";
}

function readSecretForm() {
  const s = {};
  for (const [f, id] of Object.entries(secretInputs)) s[f] = $(id).value;
  return s;
}

function readTsaForm() {
  const tsa = {};
  for (const f of tsaFields) tsa[f] = $(fieldId(f)).value.trim();
  return { ...tsa, ...readSecretForm() };
}

function fillTsaForm(tsa, secret) {
  for (const f of tsaFields) $(fieldId(f)).value = tsa[f] || "";
  for (const [f, id] of Object.entries(secretInputs)) $(id).value = secret?.[f] || "";
}

// Configurazione di un servizio: quella salvata, o l'URL predefinito e
// nessuna credenziale.
function profileFor(preset) {
  return settings.tsaProfiles[preset] || { url: TSA_PRESETS[preset]?.url || "" };
}

function stripSecrets(tsa) {
  const out = { ...tsa };
  for (const f of SECRET_FIELDS) delete out[f];
  return out;
}

function readForm() {
  const tsa = readTsaForm();
  settings.tsa = { ...stripSecrets(tsa), preset: presetEl.value };
  settings.tsaProfiles[presetEl.value] = stripSecrets(tsa);
  if (!locked) secrets[presetEl.value] = readSecretForm();
  settings.secretMode = $("secretMode").value;
  for (const [f, { min, max }] of Object.entries(numberFields)) {
    const v = Number($(f).value);
    settings.advanced[f] = Number.isFinite(v) && $(f).value !== ""
      ? Math.min(max, Math.max(min, Math.round(v)))
      : DEFAULT_SETTINGS.advanced[f];
  }
  settings.advanced.subfolder = cleanSubfolder($("subfolder").value);
  settings.advanced.tlsCheck = $("tlsCheck").checked;
  settings.advanced.custodyRequired = $("custodyRequired").checked;
  settings.advanced.tabHistory = $("tabHistory").checked;
  settings.advanced.listExtensions = $("listExtensions").checked;
  settings.custody = { ...settings.custody, ...cleanCustody({ ...settings.custody,
    operator: $("custodyOperator").value, organization: $("custodyOrganization").value }) };
  settings.advanced.printOrientation = $("printOrientation").value === "landscape" ? "landscape" : "portrait";
}

function renderVault() {
  const encrypted = $("secretMode").value === "encrypted";
  $("vaultBox").hidden = !encrypted;
  $("secretModeHelp").textContent = t(encrypted ? "options.secrets.help.encrypted" : "options.secrets.help.session");

  locked = encrypted && !!vault && !vaultKey;
  for (const id of Object.values(secretInputs)) {
    $(id).disabled = locked;
    $(id).placeholder = locked ? t("options.vault.lockedPlaceholder") : "";
  }
  $("unlock").hidden = !locked;
  $("vaultPasswordLabel").textContent = t(locked ? "options.vault.password"
    : vault ? "options.vault.newPassword" : "options.vault.choosePassword");
  $("vaultStatus").className = "desc";
  $("vaultStatus").textContent = !encrypted ? ""
    : locked ? t("options.vault.locked")
    : vault ? t("options.vault.unlocked")
    : t("options.vault.empty", { min: VAULT_MIN_PASSWORD });
}

function fillForm() {
  currentPreset = TSA_PRESETS[settings.tsa.preset] ? settings.tsa.preset : "custom";
  presetEl.value = currentPreset;
  $("secretMode").value = settings.secretMode;
  fillTsaForm(settings.tsa, secrets[currentPreset]);
  for (const f of Object.keys(numberFields)) $(f).value = settings.advanced[f];
  $("subfolder").value = settings.advanced.subfolder;
  $("tlsCheck").checked = settings.advanced.tlsCheck !== false;
  $("custodyRequired").checked = !!settings.advanced.custodyRequired;
  $("tabHistory").checked = !!settings.advanced.tabHistory;
  $("listExtensions").checked = !!settings.advanced.listExtensions;
  $("custodyOperator").value = settings.custody.operator || "";
  $("custodyOrganization").value = settings.custody.organization || "";
  $("printOrientation").value = settings.advanced.printOrientation === "landscape" ? "landscape" : "portrait";
  renderVault();
  checkTsaWarning();
}

function checkTsaWarning() {
  const tsa = readTsaForm();
  const warning = $("tsaWarning");
  let insecure = false;
  try { insecure = new URL(tsa.url).protocol !== "https:" && tsaSendsSecrets(tsa); } catch (_) {}
  const badHeader = !isValidHeaderName(tsa.headerName);
  const privateHost = isPrivateHost(tsa.url);
  const badCa = !isValidCaPem(tsa.caPem);
  warning.hidden = !insecure && !badHeader && !privateHost && !badCa;
  warning.textContent = [insecure && t("options.tsa.insecure"), badHeader && t("tsa.badHeader"),
    privateHost && t("options.tsa.private"), badCa && t("options.tsa.caPem.invalid")]
    .filter(Boolean).join(" ");
}

function markDirty() {
  dirty = true;
  show(saveStatus, t("options.unsaved"), "");
}

// Il permesso per l'host della TSA va chiesto durante un clic dell'utente,
// prima di qualsiasi altra attesa; se c'è già, request risponde subito.
function ensurePermission(url) {
  return chrome.permissions.request({ origins: [originPattern(url)] });
}

// Salva credenziali (in memoria ed eventualmente cifrate su disco) e
// impostazioni. Le scelte del popup restano quelle più recenti.
async function store() {
  if (settings.secretMode === "encrypted") {
    if (locked) throw new Error(t("vault.unlockFirst"));
    const newPassword = $("vaultPassword").value;
    if (newPassword) {
      if (newPassword.length < VAULT_MIN_PASSWORD) {
        throw new Error(t("vault.tooShort", { min: VAULT_MIN_PASSWORD }));
      }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      vaultKey = await deriveVaultKey(newPassword, salt);
      vault = { salt: bytesToBase64(salt) };
    }
    if (hasSecrets(secrets)) {
      if (!vaultKey) throw new Error(t("vault.needPassword"));
      vault = await encryptSecrets(secrets, vaultKey, base64ToBytes(vault.salt), vault.iterations || VAULT_ITERATIONS);
      await chrome.storage.local.set({ tsaVault: vault });
      await chrome.storage.session.set({ tsaVaultKey: await exportVaultKey(vaultKey) });
    } else {
      vault = null;
      await chrome.storage.local.remove("tsaVault");
    }
    $("vaultPassword").value = "";
  } else {
    vault = null;
    vaultKey = null;
    await chrome.storage.local.remove("tsaVault");
    await chrome.storage.session.remove("tsaVaultKey");
  }
  await chrome.storage.session.set({ tsaSecrets: secrets });

  const { tsa, tsaProfiles, advanced, secretMode, custody } = settings;
  settings = await updateSettings((s) => {
    Object.assign(s, { tsa, tsaProfiles, advanced, secretMode });
    s.custody = { ...s.custody, operator: custody.operator, organization: custody.organization };
  });
  dirty = false;
  $("subfolder").value = settings.advanced.subfolder;
  renderVault();
}

presetEl.addEventListener("change", () => {
  const tsa = readTsaForm();
  settings.tsaProfiles[currentPreset] = stripSecrets(tsa);
  if (!locked) secrets[currentPreset] = readSecretForm();
  currentPreset = presetEl.value;
  fillTsaForm(profileFor(currentPreset), secrets[currentPreset]);
  checkTsaWarning();
  markDirty();
});

$("secretMode").addEventListener("change", () => {
  renderVault();
  markDirty();
});

// La lingua si applica e si salva subito, senza toccare le altre modifiche in corso.
$("language").addEventListener("change", async () => {
  const language = $("language").value;
  await updateSettings((s) => { s.language = language; });
  settings.language = language;
  setLanguage(language);
  translatePage();
  renderVault();
  checkTsaWarning();
  if (dirty) show(saveStatus, t("options.unsaved"), "");
});

document.querySelectorAll("input, textarea, #printOrientation").forEach((el) => el.addEventListener("input", () => {
  if (el.id.startsWith("tsa")) checkTsaWarning();
  if (el.id !== "vaultPassword" || !locked) markDirty();
}));

// Il permesso "management" va chiesto durante il clic dell'utente.
$("listExtensions").addEventListener("change", async (e) => {
  if (!e.target.checked) return;
  const granted = await chrome.permissions.request({ permissions: ["management"] }).catch(() => false);
  if (!granted) e.target.checked = false;
});

window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

$("unlock").addEventListener("click", async () => {
  const status = $("vaultStatus");
  try {
    const key = await deriveVaultKey($("vaultPassword").value, base64ToBytes(vault.salt), vault.iterations);
    const opened = await decryptSecrets(vault, key);
    // Le credenziali inserite in questa sessione hanno la precedenza.
    secrets = { ...opened, ...secrets };
    vaultKey = key;
    await chrome.storage.session.set({ tsaSecrets: secrets, tsaVaultKey: await exportVaultKey(key) });
    $("vaultPassword").value = "";
    renderVault();
    fillTsaForm(readTsaForm(), secrets[presetEl.value]);
  } catch (err) {
    status.textContent = err.message;
    status.className = "desc error";
  }
});

$("save").addEventListener("click", async () => {
  readForm();
  if (settings.tsa.url) {
    try {
      new URL(settings.tsa.url);
    } catch {
      show(saveStatus, t("options.invalidUrl"), "error");
      return;
    }
  }
  try {
    const granted = settings.tsa.url ? await ensurePermission(settings.tsa.url) : true;
    await store();
    show(saveStatus, t(granted ? "options.saved" : "options.savedNoPermission"), granted ? "ok" : "error");
  } catch (err) {
    show(saveStatus, err.message, "error");
  }
});

$("reset").addEventListener("click", async () => {
  if (!confirm(t("options.resetConfirm"))) return;
  settings = await updateSettings((s) => {
    s.tsa = { ...DEFAULT_SETTINGS.tsa };
    s.tsaProfiles = {};
    s.secretMode = DEFAULT_SETTINGS.secretMode;
    s.advanced = { ...DEFAULT_SETTINGS.advanced };
  });
  secrets = {};
  vault = null;
  vaultKey = null;
  await chrome.storage.local.remove("tsaVault");
  await chrome.storage.session.remove(["tsaSecrets", "tsaVaultKey"]);
  fillForm();
  dirty = false;
  show(saveStatus, t("options.resetDone"), "ok");
});

$("testTsa").addEventListener("click", async () => {
  const tsa = readTsaForm();
  const out = $("tsaResult");
  const btn = $("testTsa");
  try {
    new URL(tsa.url);
  } catch {
    show(out, t("options.test.invalidUrl"), "error");
    return;
  }
  if (!(await ensurePermission(tsa.url))) {
    show(out, t("options.test.denied"), "error");
    return;
  }
  btn.disabled = true;
  show(out, t("options.test.running"));
  try {
    const hash = await sha256Bytes(new TextEncoder().encode(`test ${Date.now()}`));
    const ts = await requestTimestamp(hash, tsa);
    const note = dirty ? t("options.test.remember") : "";
    show(out, t("options.test.ok", { time: ts.genTime, policy: ts.policy, size: ts.tsr.length }) + " "
      + timestampCheckMessage(ts) + note, ts.verification === "verified" ? "ok" : "error");
  } catch (err) {
    show(out, err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// Copy only the fixed public identifiers displayed in this panel. No account,
 // payment or acquisition data is sent by the extension.
async function copySupportIdentifier(elementId, successKey) {
  try {
    await navigator.clipboard.writeText($(elementId).textContent);
    show($("supportStatus"), t(successKey), "ok");
  } catch (_) {
    show($("supportStatus"), t("options.support.copyManual"), "");
  }
}
$("copySupportUsername").addEventListener("click", () =>
  copySupportIdentifier("supportUsername", "options.support.usernameCopied"));
$("copySupportPromo").addEventListener("click", () =>
  copySupportIdentifier("supportPromoCode", "options.support.promoCopied"));

const manifest = chrome.runtime.getManifest();
$("version").textContent = `${manifest.name} ${manifest.version}`;

(async () => {
  const migrated = await migratePlaintextSecrets();
  settings = await getSettings();
  setLanguage(settings.language);
  translatePage();
  secrets = (await getSessionSecrets()) || {};
  vault = await getVault();
  const { tsaVaultKey } = await chrome.storage.session.get("tsaVaultKey");
  if (vault && tsaVaultKey) vaultKey = await importVaultKey(tsaVaultKey);
  fillForm();
  if (migrated) {
    show(saveStatus, t("options.migrated"), "error");
  }
})();
