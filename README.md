<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="">
</p>

<h1 align="center">Forensic Web Capture</h1>

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
- **Report di acquisizione** in testo (e facoltativamente JSON), inclusi nel manifest SHA-256 insieme ai reperti.
- **Copia della pagina** in MHTML (si riapre in Chrome) e sorgente HTML visualizzato come testo inerte.
- **Dati di rete**: IP del server, risposta HTTP, redirect, header, certificato TLS e sua impronta.
- **Confronto indicativo dell'orologio del PC** con il server; l’ora dichiarata dalla TSA è mostrata come non verificata.
- **Marca temporale RFC 3161** con qualsiasi servizio (TSA) compatibile, anche con credenziali o API key.
- **Tutto in un unico ZIP** con `SHA256SUMS.txt`, pronto da archiviare o consegnare.

- **Quattro lingue**: inglese, italiano, francese e spagnolo, per interfaccia, report e copertina.

Ogni funzione si attiva o disattiva dal popup dell'estensione.

## Installazione

### Da una release

1. Scarica l'ultimo `forensic-web-capture-x.y.z.zip` dalla pagina [Releases](../../releases).
2. Estrai lo zip in una cartella che non cancellerai (il browser legge i file da lì).
3. Apri la pagina delle estensioni e attiva la **Modalità sviluppatore**:

   | Browser | Indirizzo | Interruttore |
   |---------|-----------|--------------|
   | Chrome  | `chrome://extensions` | *Modalità sviluppatore*, in alto a destra |
   | Edge    | `edge://extensions`   | *Modalità sviluppatore*, nel pannello a sinistra |
   | Brave   | `brave://extensions`  | *Modalità sviluppatore*, in alto a destra |

4. Clicca **Carica estensione non pacchettizzata** (Edge: **Carica decompressa**) e seleziona
   la cartella estratta.
5. Fissa l'estensione nella barra degli strumenti (icona del puzzle → puntina).

Lo stesso pacchetto funziona su tutti i browser basati su Chromium (Chrome, Edge, Brave,
Opera, Vivaldi). Firefox non è supportato: non espone alle estensioni il Chrome DevTools
Protocol su cui si basa la cattura.

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
Download; l’esito positivo viene mostrato solo dopo la conferma di completamento di Chrome; il popup mostra l'hash SHA-256 del file principale ed eventuali avvisi.

Durante la cattura Chrome mostra la barra *"Forensic Web Capture ha avviato il debug di questo
browser"*: è normale, perché l'estensione usa il Chrome DevTools Protocol, e sparisce a fine cattura.

### Funzioni

| Interruttore | Cosa fa |
|---|---|
| Pagina di copertina | Aggiunge al PDF una prima pagina con i dati dell'acquisizione (solo PDF) |
| Scorri la pagina prima della cattura | Scorre fino in fondo per caricare le immagini *lazy* |
| Salva pagina completa (MHTML) | Salva la pagina in un unico file riapribile in Chrome |
| Salva sorgente HTML | Salva una pagina di consultazione che mostra il DOM come testo inerte, senza interpretarlo come markup |
| Dati di rete e certificato | **Ricarica la pagina** e registra risposta HTTP, IP, redirect, header e certificato TLS |
| Marca temporale RFC 3161 | Invia l’hash del manifest (reperti e report) alla TSA; salva token `.tsr` ed esito `.timestamp.json` |
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
| `<id>.pdf` | Copertina + screenshot integrale |
| `<id>.mhtml` | Copia completa della pagina |
| `<id>.html` | Pagina HTML che mostra il sorgente DOM come testo inerte, con CSP restrittiva |
| `<id>.tsr` | Risposta RFC 3161 relativa al manifest (token firmato dalla TSA) |
| `<id>.report.txt` | Report leggibile con dati, hash e istruzioni di verifica |
| `<id>.report.json` | Lo stesso report in JSON |
| `<id>.manifest.sha256` | Hash di screenshot, copie della pagina e report; è il file sottoposto a marcatura |
| `<id>.timestamp.json` | Esito TSA, hash del manifest ed esito della verifica della firma (`verified`, `untrusted`, `invalid`, `unsupported`) con firmatario, catena e motivo, anche in caso di errore |
| `SHA256SUMS.txt` | Hash di tutti gli altri file nello ZIP, inclusi report, manifest, token e ricevuta |

`<id>` è `capture_<data>_<UUID>`: il titolo della pagina resta nei metadati e non entra nei
nomi o nei comandi. Senza ZIP il riepilogo è `<id>.SHA256SUMS.txt`, sempre incluso.

Il manifest viene creato **prima** della richiesta TSA: comprende anche i report immutabili,
che descrivono la richiesta e rimandano alla ricevuta separata per l’esito. Token e ricevuta
sono esclusi dal manifest per evitare dipendenze circolari, ma inclusi nel riepilogo finale.
Lo schema JSON del report è `full-page-screenshot/report@2`.

Gli hash da soli rilevano variazioni rispetto a un riferimento conservato: non autenticano
l’autore. Per il legame temporale verificare la firma del token e gli hash del manifest.
Se la TSA fallisce, i reperti vengono comunque salvati con ricevuta di errore e avviso.

## Verificare un'acquisizione

**Hash dei file**

```sh
sha256sum -c SHA256SUMS.txt
```

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '<file>'
```

**Marca temporale** (esempio con FreeTSA, i cui certificati sono su
[freetsa.org](https://freetsa.org/index_en.php)):

```sh
curl -O https://freetsa.org/files/cacert.pem
curl -O https://freetsa.org/files/tsa.crt

openssl ts -reply -in "<id>.tsr" -text
openssl ts -verify -data "<id>.manifest.sha256" -in "<id>.tsr" -CAfile cacert.pem -untrusted tsa.crt
sha256sum -c "<id>.manifest.sha256"
```

OpenSSL deve rispondere `Verification: OK`; il controllo del manifest deve dare `OK` per
ogni file. Usare certificati TSA e CA ottenuti da una fonte fidata. Non usare automaticamente
un certificato ricevuto nel pacchetto come radice fidata.

L’estensione controlla struttura DER, algoritmo SHA-256, hash, nonce obbligatorio e policy
richiesta, poi **verifica la firma CMS e la catena dei certificati**:

- l’impronta firmata (`messageDigest`) corrisponde al contenuto della marca;
- il certificato indicato negli attributi firmati (`signingCertificate`, v1 o v2) è quello del firmatario;
- la firma è valida (RSA PKCS#1 v1.5, RSA-PSS, ECDSA P-256/P-384/P-521 con SHA-256/384/512);
- il certificato della TSA ha l’uso `timeStamping` ed era valido all’ora dichiarata;
- la catena risale a una CA radice attendibile; ogni CA intermedia deve essere una CA
  (`basicConstraints`, `keyUsage`, `pathLen`) valida all’ora dichiarata.

Le radici incluse sono quelle dei servizi preimpostati (`lib/tsaroots.js`):
DigiCert Trusted Root G4, Sectigo Public Time Stamping Root R46, USERTrust RSA Certification
Authority e Free TSA Root CA. Per un altro servizio (ad esempio Aruba) si possono aggiungere
le sue CA in formato PEM nelle opzioni, nel profilo del servizio.

Esiti possibili, mostrati nel popup, nel test del servizio e nella ricevuta:

| Esito | Significato |
|-------|-------------|
| `verified` | Firma valida e catena fino a una radice attendibile |
| `untrusted` | Firma valida, ma la catena non arriva a una radice attendibile |
| `invalid` | Firma, impronta o certificato non corrispondono: il token è conservato ma non va considerato affidabile |
| `unsupported` | Algoritmo non gestito: verificare con OpenSSL |

**La revoca dei certificati (CRL/OCSP) non viene controllata.** Per una verifica
indipendente, o se serve anche la revoca, usare OpenSSL come indicato sopra. Il report
viene creato prima della richiesta di marca, quindi indica solo la richiesta: l’esito è
nella ricevuta `<id>.timestamp.json`. Le acquisizioni precedenti alla 1.6.0 restano
verificabili con il file principale come bersaglio, secondo le istruzioni del loro report.

## Limiti e valore probatorio

- Data e ora dello screenshot vengono dall'orologio del computer. L’ora dichiarata dalla TSA deve
  essere convalidata verificando firma e catena; le garanzie dipendono dal servizio utilizzato.
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
temporale: le valutazioni del DOM avvengono in un mondo isolato con timeout, i cookie e le
password nell’URL principale vengono rimossi dai report. Il sorgente HTML viene mostrato come
testo inerte: non è una copia navigabile della pagina. L’MHTML resta una copia attiva e va
riaperto soltanto in un ambiente isolato adeguato.
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
temporale è attiva, invia al servizio scelto **solo l’hash SHA-256** del manifest, mai i file né l’URL.
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

Nessuna dipendenza esterna a runtime né passo di build: il codice si carica così com’è in Chrome.
I test richiedono Node.js >= 20, Python 3 e OpenSSL. La CI esegue test e confezionamento su
push e pull request; gli stessi test bloccano il rilascio in caso di errore.
I test simulano le API Chrome e verificano il parser HTML in modo indipendente: il collaudo
manuale in Chrome resta necessario per pagine dinamiche, download e interfaccia.

```sh
python tools/check.py        # sintassi + test, inclusa TSA OpenSSL locale
python tools/build.py        # crea dist/forensic-web-capture-<versione>.zip
python tools/make_icons.py   # rigenera le icone (richiede Pillow)
```

**Pubblicare una release**: aggiorna `version` in `manifest.json` e il [CHANGELOG](CHANGELOG.md),
poi crea e invia un tag con la stessa versione. GitHub Actions crea il pacchetto e la release.

```sh
git tag v1.6.0
git push origin v1.6.0
```

## Licenza

[MIT](LICENSE) © 2026 Andrea Martin

