<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="">
</p>

<h1 align="center">Full Page Screenshot</h1>

<p align="center">
  Estensione per Google Chrome che cattura l'<strong>intera pagina web</strong> in PDF o immagine
  e produce un <strong>pacchetto di acquisizione verificabile</strong>: hash SHA-256, report,
  dati di rete, copia della pagina e marca temporale RFC 3161.
</p>

---

## Funzionalità

- **Screenshot della pagina intera** con lo stesso meccanismo di *Capture full size screenshot* di
  Chrome DevTools, anche sui siti che disegnano solo la parte visibile (es. Reddit).
- **Larghezza simulata**: finestra attuale, 1920, 1366, 1024 o 390 px (mobile).
- **Formati**: PDF, PNG o JPEG. Nel PDF lo screenshot è incorporato così com'è; le pagine molto alte
  vengono divise su più pagine PDF senza perdere nulla.
- **Pagina di copertina** nel PDF con URL, data/ora, browser, dati di rete e hash dei file correlati.
- **Report di acquisizione** in testo (e facoltativamente JSON) con gli hash SHA-256 di tutti i file.
- **Copia della pagina** in MHTML (si riapre in Chrome) e sorgente HTML.
- **Dati di rete**: IP del server, risposta HTTP, redirect, header, certificato TLS e sua impronta.
- **Controllo dell'orologio del PC** rispetto al server e alla TSA, con avviso se è sfasato.
- **Marca temporale RFC 3161** con qualsiasi servizio (TSA) compatibile, anche con credenziali o API key.
- **Tutto in un unico ZIP** con `SHA256SUMS.txt`, pronto da archiviare o consegnare.

- **Quattro lingue**: inglese, italiano, francese e spagnolo, per interfaccia, report e copertina.

Ogni funzione si attiva o disattiva dal popup dell'estensione.

## Installazione

### Da una release

1. Scarica l'ultimo `full-page-screenshot-x.y.z.zip` dalla pagina [Releases](../../releases).
2. Estrai lo zip in una cartella che non cancellerai (Chrome legge i file da lì).
3. Apri `chrome://extensions` e attiva la **Modalità sviluppatore** (in alto a destra).
4. Clicca **Carica estensione non pacchettizzata** e seleziona la cartella estratta.
5. Fissa l'estensione nella barra degli strumenti (icona del puzzle → puntina).

### Dal codice sorgente

```sh
git clone <url-del-repository>
```

Poi segui i passaggi 3–5 selezionando la cartella del repository. Dopo ogni modifica al codice
basta premere ↻ sull'estensione in `chrome://extensions`.

> Chrome su Windows e macOS non permette di installare file `.crx` che non provengono dal
> Chrome Web Store: per questo l'estensione si distribuisce come cartella da caricare.

## Uso

Clicca l'icona dell'estensione (o premi <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>), scegli
larghezza, formato e funzioni, poi **Cattura pagina intera**. I file finiscono nella cartella
Download; il popup mostra l'hash SHA-256 del file principale ed eventuali avvisi.

Durante la cattura Chrome mostra la barra *"Full Page Screenshot ha avviato il debug di questo
browser"*: è normale, perché l'estensione usa il Chrome DevTools Protocol, e sparisce a fine cattura.

### Funzioni

| Interruttore | Cosa fa |
|---|---|
| Pagina di copertina | Aggiunge al PDF una prima pagina con i dati dell'acquisizione (solo PDF) |
| Scorri la pagina prima della cattura | Scorre fino in fondo per caricare le immagini *lazy* |
| Salva pagina completa (MHTML) | Salva la pagina in un unico file riapribile in Chrome |
| Salva sorgente HTML | Salva il DOM della pagina al momento della cattura |
| Dati di rete e certificato | **Ricarica la pagina** e registra risposta HTTP, IP, redirect, header e certificato TLS |
| Marca temporale RFC 3161 | Invia l'hash del file principale alla TSA e salva il token `.tsr` |
| Report anche in JSON | Salva il report anche in formato leggibile dalle macchine |
| Tutto in un unico ZIP | Raggruppa tutti i file in uno ZIP non compresso, con `SHA256SUMS.txt` |

### Impostazioni

Dall'icona ⚙ del popup:

- **Lingua**: automatica (quella del browser), English, Italiano, Français o Español. Vale per
  l'interfaccia e per i file generati (report e copertina del PDF).
- **Marca temporale**: servizio predefinito (FreeTSA, DigiCert, Sectigo, Aruba) o URL personalizzato,
  utente e password (autenticazione Basic), header personalizzato per API key, policy OID.
  Il pulsante **Prova il servizio** esegue una richiesta di test.
- **Conservazione delle credenziali**: solo in memoria fino alla chiusura del browser
  (predefinito), oppure cifrate su questo computer con una password di protezione
  (AES-256-GCM, PBKDF2 a 600.000 iterazioni) da inserire a ogni avvio del browser.
- **Avanzate**: qualità JPEG nel PDF, attesa dopo il ridimensionamento, tempo massimo di caricamento,
  altezza massima catturata, sottocartella di Download in cui salvare le acquisizioni.

Ogni servizio di marca temporale ha la sua configurazione: cambiando servizio, le credenziali
dell'altro non vengono mai inviate. Credenziali e header non vengono mai inviati a servizi
`http`, dove viaggerebbero in chiaro, e non vengono mai scritti in chiaro su disco.

Se il popup si chiude durante la cattura, l'icona mostra l'esito (`OK`, `!` con avvisi, `ERR`)
e riaprendo il popup si ritrovano hash e avvisi dell'ultima acquisizione.

## File generati

Con tutte le funzioni attive, ogni acquisizione produce:

| File | Contenuto |
|---|---|
| `<titolo>_<data>.pdf` | Copertina + screenshot integrale |
| `<titolo>_<data>.mhtml` | Copia completa della pagina |
| `<titolo>_<data>.html` | Sorgente HTML (DOM), con una CSP in testa che all'apertura blocca script e risorse esterne |
| `<titolo>_<data>.tsr` | Marca temporale RFC 3161 del PDF |
| `<titolo>_<data>.report.txt` | Report leggibile con dati, hash e istruzioni di verifica |
| `<titolo>_<data>.report.json` | Lo stesso report in JSON |
| `SHA256SUMS.txt` | Hash di tutti i file (solo nello ZIP) |

## Verificare un'acquisizione

**Hash dei file**

```sh
sha256sum -c SHA256SUMS.txt
```

```powershell
Get-FileHash -Algorithm SHA256 "<file>"
```

**Marca temporale** (esempio con FreeTSA, i cui certificati sono su
[freetsa.org](https://freetsa.org/index_en.php)):

```sh
curl -O https://freetsa.org/files/cacert.pem
curl -O https://freetsa.org/files/tsa.crt

openssl ts -reply -in "<file>.tsr" -text
openssl ts -verify -data "<file>.pdf" -in "<file>.tsr" -CAfile cacert.pem -untrusted tsa.crt
```

L'ultimo comando deve rispondere `Verification: OK`.

## Limiti e valore probatorio

- Data e ora dello screenshot vengono dall'orologio del computer. La data certificata è solo quella
  della marca temporale; il suo valore legale dipende dal servizio usato (pieno solo con una TSA
  qualificata eIDAS).
- L'estensione documenta ciò che il browser ha ricevuto e mostrato. Non può garantire che il
  computer o il browser non fossero stati manomessi, né sostituisce una perizia forense.
- Con *Dati di rete* attivo la pagina viene ricaricata: un modulo compilato a metà va perso, e i
  contenuti dinamici (pubblicità, feed) possono cambiare rispetto a quanto visto prima.
- Gli elementi alti quanto lo schermo (`100vh`) risultano allungati per tutta la pagina, come
  avviene anche con lo screenshot di DevTools.
- Le pagine interne del browser (`chrome://`, Chrome Web Store) non si possono catturare.
- Le acquisizioni contengono quello che la pagina mostrava, compresi eventuali dati personali se
  eri autenticato. Per le pagine pubbliche conviene catturare da una finestra in incognito o da
  un profilo Chrome dedicato.

## Sicurezza

L'estensione tratta come non affidabili la pagina catturata, il server e il servizio di marca
temporale: la pagina non può falsificare l'HTML salvato né bloccare la cattura, i cookie e le
password nell'URL vengono rimossi dai report, l'HTML salvato non esegue script all'apertura.
Modello di sicurezza, rischi residui e come segnalare una vulnerabilità in [SECURITY.md](SECURITY.md).

## Permessi

| Permesso | Perché serve |
|---|---|
| `debugger` | Usare il Chrome DevTools Protocol per catturare la pagina e leggere i dati di rete |
| `activeTab` | Accedere alla scheda attiva solo quando si usa l'estensione |
| `downloads` | Salvare i file nella cartella Download |
| `storage` | Ricordare le impostazioni; tenere in memoria le credenziali della TSA |
| Host facoltativi | Contattare il servizio di marca temporale scelto; chiesto solo per quel dominio |

## Privacy

L'estensione non raccoglie dati e non contatta alcun server, con un'unica eccezione: se la marca
temporale è attiva, invia al servizio scelto **solo l'hash SHA-256** del file, mai il file né l'URL.
Dettagli in [PRIVACY.md](PRIVACY.md).

## Sviluppo

```text
manifest.json      Manifest MV3
background.js      Service worker: cattura, report, download
popup.html/js      Popup con opzioni e interruttori
options.html/js    Pagina Impostazioni
ui.css             Stili condivisi (tema chiaro/scuro)
lib/common.js      Impostazioni e funzioni comuni
lib/i18n.js        Traduzioni con lingua selezionabile
lib/locales/       Testi in en, it, fr, es (l'inglese fa da riserva)
_locales/          Nome e descrizione del manifest tradotti
lib/pdf.js         Generatore PDF (copertina + screenshot JPEG)
lib/tsa.js         Richiesta e lettura marche temporali RFC 3161
lib/zip.js         Archivio ZIP non compresso
lib/vault.js       Conservazione sicura delle credenziali della TSA
icons/             Icone (generate da tools/make_icons.py)
tools/build.py     Crea il pacchetto in dist/
```

Nessuna dipendenza esterna né passo di build: il codice si carica così com'è in Chrome.

```sh
python tools/build.py        # crea dist/full-page-screenshot-<versione>.zip
python tools/make_icons.py   # rigenera le icone (richiede Pillow)
```

**Pubblicare una release**: aggiorna `version` in `manifest.json` e il [CHANGELOG](CHANGELOG.md),
poi crea e invia un tag con la stessa versione. GitHub Actions crea il pacchetto e la release.

```sh
git tag v1.5.0
git push origin v1.5.0
```

## Licenza

[MIT](LICENSE) © 2026 Andrea Martin
