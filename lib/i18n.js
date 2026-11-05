// Traduzioni di interfaccia, messaggi e file generati.
//
// chrome.i18n segue sempre la lingua del browser e non permette di sceglierla,
// quindi qui c'è un sistema minimo con lingua selezionabile. I testi stanno in
// lib/locales/<lingua>.js; l'inglese fa da riserva per le chiavi mancanti.

const LANGUAGES = { en: "English", it: "Italiano", fr: "Français", es: "Español" };
const LOCALE_TAGS = { en: "en-GB", it: "it-IT", fr: "fr-FR", es: "es-ES" };
const I18N = {};

let currentLanguage = "en";

function detectLanguage() {
  const ui = globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || "en";
  const code = ui.slice(0, 2).toLowerCase();
  return I18N[code] ? code : "en";
}

// "auto" (o un valore sconosciuto) usa la lingua del browser.
function setLanguage(preference) {
  currentLanguage = preference && preference !== "auto" && I18N[preference] ? preference : detectLanguage();
  if (globalThis.document) document.documentElement.lang = currentLanguage;
  return currentLanguage;
}

function localeTag() {
  return LOCALE_TAGS[currentLanguage];
}

// t("chiave", { nome: valore }) sostituisce i segnaposto {nome}.
function t(key, params = {}) {
  const text = I18N[currentLanguage]?.[key] ?? I18N.en?.[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Messaggio da tradurre più tardi: il popup lo mostra nella lingua attuale
// anche se l'impostazione è cambiata dopo la cattura. Un parametro può essere
// a sua volta un messaggio ({ key, params }).
function msg(key, params = {}) {
  return { key, params };
}

function tm(message) {
  if (!message || typeof message !== "object" || !message.key) return message == null ? "" : String(message);
  const params = {};
  for (const [k, v] of Object.entries(message.params || {})) params[k] = v && typeof v === "object" && v.key ? tm(v) : v;
  return t(message.key, params);
}

// Errore con un codice stabile, indipendente dalla lingua del messaggio.
function i18nError(key, params) {
  const err = new Error(t(key, params));
  err.code = key;
  err.params = params;
  return err;
}

// Traduce gli elementi con data-i18n (testo) e data-i18n-<attributo>.
function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  for (const attr of ["placeholder", "title", "aria-label"]) {
    root.querySelectorAll(`[data-i18n-${attr}]`).forEach((el) => {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    });
  }
}
