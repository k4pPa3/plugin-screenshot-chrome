# Preparazione per il Chrome Web Store

## File da usare

- `listing-it.md` e `listing-en.md`: descrizione e collegamenti per le due lingue.
- `permissions-and-privacy.md`: scopo unico, permessi, codice remoto e trattamento dati.
- `reviewer-instructions.md`: istruzioni per la scheda Test instructions.
- `PRIVACY.md`: informativa pubblica, raggiungibile dal link indicato nei testi.
- `images/`: icona e screenshot reali a 1280×800 generati da Chromium in CI/release.
- `extension/forensic-web-capture-<versione>.zip`: ZIP effettivo da caricare nel pannello.

Il bundle `store-submission-<versione>.zip` serve a raccogliere questo materiale: **non
caricarlo come estensione**. Estrarre e caricare solo lo ZIP nella cartella `extension/`;
immagini e testi vanno aggiunti nei rispettivi campi della scheda.

La stessa build dell'estensione è distribuibile anche tramite GitHub. Non ci sono rami o
funzioni nascoste per lo store. Il contributo volontario resta facoltativo; il referral è
stato rimosso da tutte le distribuzioni nuove, senza riscrivere le release precedenti.

## Prima dell'invio

1. Registrare l'account sviluppatore, verificare contatti e autenticazione a due fattori.
   Il titolare deve completare personalmente accettazione dei termini e quota richiesta.
2. Controllare denominazione e contatti pubblici. Non dichiarare un'approvazione Google,
   un'affiliazione istituzionale o una certificazione probatoria non posseduta.
3. Caricare il pacchetto installabile, le descrizioni e almeno uno screenshot reale.
   La documentazione ufficiale immagini indica come obbligatorie icona e almeno uno
   screenshot. Le descrizioni localizzate IT/EN sono una scelta di presentazione.
4. Verificare i campi privacy correnti e le motivazioni dei permessi contro il codice.
   L'elaborazione locale non esenta dalla dichiarazione del trattamento dati.
5. Inserire il link pubblico della privacy e le istruzioni di collaudo. Non inserire
   credenziali personali o dati di casi reali per il revisore.
6. Inviare alla revisione dal pannello. Questo materiale non è un'approvazione, un invio
   già eseguito o una garanzia di accettazione da parte di Google.

## Generare gli screenshot e il bundle

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
FWC_STORE_SCREENSHOTS_DIR=dist/store-screenshots xvfb-run -a npm run test:browser
python3 tools/build.py
python3 tools/build_store.py
```

Su sistemi con display, `xvfb-run -a` può essere omesso. Gli screenshot usano solo
l'estensione e una fixture locale, senza casi reali o dati personali dell'operatore.
Il builder richiede tutti gli screenshot previsti: non sostituisce file mancanti con mockup.

## Documentazione ufficiale

- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/prepare
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
