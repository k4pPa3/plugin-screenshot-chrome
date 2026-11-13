const widthEl = document.getElementById("width");
const formatEl = document.getElementById("format");
const button = document.getElementById("capture");
const status = document.getElementById("status");
const resultEl = document.getElementById("result");
const tsaHint = document.getElementById("tsaHint");
const switches = [...document.querySelectorAll("[data-feature]")];
const timestampSwitch = document.querySelector('[data-feature="timestamp"]');
const custodyInputs = [...document.querySelectorAll("[data-custody]")];
const custodyBox = document.getElementById("custodyBox");
const custodySummary = document.getElementById("custodySummary");

let settings;
let pendingSettings = Promise.resolve();

function setStatus(text, isError = false) {
  status.textContent = text;
  status.className = isError ? "error" : "";
}

// L'HAR si registra durante la ricarica dei dati di rete.
function syncHarSwitch() {
  const har = document.querySelector('[data-feature="har"]');
  har.disabled = !document.querySelector('[data-feature="network"]').checked;
  har.closest(".switch").classList.toggle("disabled", har.disabled);
  const shareable = document.querySelector('[data-feature="shareableHar"]');
  shareable.disabled = har.disabled || !har.checked;
  shareable.closest(".switch").classList.toggle("disabled", shareable.disabled);
}

// Copertina e copia per la stampa esistono solo nel formato PDF.
function syncCoverSwitch() {
  formatEl.disabled = !document.querySelector('[data-feature="screenshot"]').checked;
  widthEl.disabled = formatEl.disabled;
  for (const name of ["cover", "printPdf"]) {
    const el = document.querySelector(`[data-feature="${name}"]`);
    el.disabled = formatEl.disabled || formatEl.value !== "pdf";
    el.closest(".switch").classList.toggle("disabled", el.disabled);
  }
}

async function showTsaHint() {
  let host = "";
  try { host = new URL(settings.tsa.url).hostname; } catch (_) {}
  const { tsaSecrets } = await chrome.storage.session.get("tsaSecrets");
  const secret = tsaSecrets?.[settings.tsa.preset];
  const needsSecret = !!(settings.tsa.username || settings.tsa.headerName);
  const missing = needsSecret && !secret?.password && !secret?.headerValue;
  tsaHint.textContent = !host ? t("popup.tsa.notConfigured")
    : missing ? t(settings.secretMode === "encrypted" ? "popup.tsa.locked" : "popup.tsa.missing", { host })
    : t("popup.tsa.host", { host });
  // Un clic sull'indicazione apre le Impostazioni quando c'è qualcosa da sistemare.
  tsaHint.dataset.needsSettings = !host || missing ? "1" : "";
}

function persist() {
  const width = Number(widthEl.value) || 0;
  const format = formatEl.value;
  const features = Object.fromEntries(switches.map((el) => [el.dataset.feature, el.checked]));
  const custody = Object.fromEntries(custodyInputs.map((el) => [el.dataset.custody, el.value]));
  const save = pendingSettings.then(() => updateSettings((s) => {
    Object.assign(s, { width, format });
    Object.assign(s.features, features);
    Object.assign(s.custody, custody);
  })).then((s) => { settings = s; syncCustody(); });
  pendingSettings = save.catch((err) => { setStatus(err.message, true); });
  return save;
}

// Riepilogo della catena di custodia nella riga chiusa; in rosso se i dati
// obbligatori mancano.
function custodyMissing() {
  const c = settings.custody;
  return settings.advanced.custodyRequired && (!c.operator.trim() || !c.caseRef.trim());
}

function syncCustody() {
  const c = settings.custody;
  custodySummary.textContent = [c.operator, c.caseRef].map((x) => x.trim()).filter(Boolean).join(" · ")
    || (settings.advanced.custodyRequired ? t("popup.custody.required") : t("popup.custody.optional"));
  custodyBox.classList.toggle("missing", custodyMissing());
}

function addHash(label, value) {
  const l = document.createElement("div");
  l.className = "hash-label";
  l.textContent = label;
  const h = document.createElement("div");
  h.className = "hash";
  h.textContent = value;
  resultEl.append(l, h);
}

function timeOf(ms) {
  return new Date(ms).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Connessione ispezionata da software locale: spiega cosa fare e lascia
// scegliere tra ricontrollare (dopo aver disattivato la protezione) e procedere.
function renderInterception(info) {
  const box = document.createElement("div");
  box.className = "tls-box";
  const title = document.createElement("strong");
  title.textContent = t(info.status === "likely" ? "popup.tls.title" : "popup.tls.titleSuspected",
    { issuer: info.product || info.issuer || "?" });
  const body = document.createElement("p");
  body.textContent = t("popup.tls.body");
  const actions = document.createElement("div");
  actions.className = "tls-actions";
  const retry = document.createElement("button");
  retry.className = "primary";
  retry.textContent = t("popup.tls.retry");
  retry.addEventListener("click", () => startCapture(false));
  const force = document.createElement("button");
  force.className = "secondary";
  force.textContent = t("popup.tls.override");
  force.addEventListener("click", () => startCapture(true));
  actions.append(retry, force);
  box.append(title, body, actions);
  resultEl.append(box);
}

// Mostra lo stato della cattura salvato dal service worker.
function render(state) {
  resultEl.replaceChildren();
  button.disabled = state?.status === "running";
  if (!state) { setStatus(""); return; }

  if (state.status === "running") {
    setStatus(t(settings?.features.network ? "popup.runningNetwork" : "popup.running"));
    return;
  }
  if (state.status === "interception") {
    setStatus("");
    renderInterception(state.interception || {});
  } else if (state.status === "error") {
    setStatus(state.errorMsg ? tm(state.errorMsg) : state.error, true);
  } else {
    setStatus(t("popup.saved", { width: state.width, height: state.height }));
    addHash(t("popup.hashOf", { file: state.filename }), state.hash);
    if (state.zipHash) addHash(t("popup.zipHash"), state.zipHash);
    if (state.genTime) addHash(t("popup.tsaTime"), state.genTime);
    for (const [cls, list] of [["note", state.notes], ["warn", state.warnings]]) {
      for (const text of list || []) {
        const el = document.createElement("div");
        el.className = cls;
        el.textContent = tm(text);
        resultEl.append(el);
      }
    }
  }
  const last = document.createElement("div");
  last.className = "last";
  last.textContent = t("popup.last", { time: timeOf(state.updatedAt), title: state.title || state.url });
  last.title = state.url;
  resultEl.append(last);
}

(async () => {
  settings = await getSettings();
  setLanguage(settings.language);
  applyI18n();
  widthEl.value = String(settings.width);
  formatEl.value = settings.format;
  for (const el of switches) el.checked = !!settings.features[el.dataset.feature];
  for (const el of custodyInputs) el.value = settings.custody[el.dataset.custody] || "";
  syncCoverSwitch();
  syncHarSwitch();
  syncCustody();
  if (custodyMissing()) custodyBox.open = true;
  showTsaHint();

  const { capture } = await chrome.storage.session.get("capture");
  render(capture);
  chrome.action.setBadgeText({ text: capture?.status === "running" ? "…" : "" });
})();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.capture) render(changes.capture.newValue);
});

widthEl.addEventListener("change", persist);
formatEl.addEventListener("change", () => { syncCoverSwitch(); persist(); });
switches.forEach((el) => el.addEventListener("change", () => { syncHarSwitch(); syncCoverSwitch(); persist(); }));
custodyInputs.forEach((el) => el.addEventListener("change", persist));

document.getElementById("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
tsaHint.addEventListener("click", (e) => {
  if (tsaHint.dataset.needsSettings) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  }
});

// Il permesso per contattare la TSA va chiesto durante un gesto dell'utente.
timestampSwitch.addEventListener("change", async (e) => {
  if (!e.target.checked || !settings.tsa.url) return;
  const granted = await chrome.permissions.request({ origins: [originPattern(settings.tsa.url)] });
  if (!granted) setStatus(t("popup.tsa.noPermission"), true);
});

button.addEventListener("click", () => startCapture(false));

async function startCapture(override) {
  try { await persist(); } catch (_) { return; }

  if (custodyMissing()) {
    custodyBox.open = true;
    setStatus(t("err.custodyMissing"), true);
    return;
  }

  if (settings.features.timestamp && !settings.tsa.url) {
    setStatus(t("popup.tsa.configure"), true);
    return;
  }

  button.disabled = true;
  resultEl.replaceChildren();
  setStatus(t("popup.starting"));

  // L'esito arriva tramite storage.session (vedi render); la risposta serve
  // solo per gli errori immediati, come una cattura già in corso.
  const res = await chrome.runtime.sendMessage({ type: "capture", override });
  if (res?.busy) {
    setStatus(t("err.busy"), true);
    button.disabled = true;
  }
}
