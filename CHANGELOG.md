# Changelog

Tutte le modifiche rilevanti del progetto. Il formato segue
[Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il
[Semantic Versioning](https://semver.org/lang/it/).

## [1.8.1] - 2026-11-13

### Corretto

- Screenshot, report TXT e file delle impronte seguono le opzioni del popup. Con il solo
  MHTML attivo si salva un unico file `.mhtml`.
- Una sola scelta della destinazione per acquisizione. Più file, inclusa l'eventuale bozza
  PEC, vengono salvati in uno ZIP. Il popup mostra l'impronta SHA-256 dell'archivio.
- Il timeout del download parte dopo la scelta della destinazione.

## [1.8.0] - 2026-11-06

### Aggiunto

- Testo visibile ed elenco dei link della pagina (`<id>.text.txt`, facoltativo), letti nel
  mondo isolato: a differenza dello screenshot si può cercare. Password negli URL oscurate,
  massimo 20.000 link, solo documento principale (non gli iframe). Incluso in manifest e
  marca temporale. Se la lettura non riesce, l'acquisizione prosegue con un avviso.
- Catena completa dei certificati TLS del sito in PEM (`<id>.cert.pem`) con i dati di rete
  su pagine `https`; prima c'era solo l'impronta del certificato. Inclusa nel manifest.
- Sistema operativo e architettura nei dati dell'ambiente (report e copertina).
- Impronta dello ZIP salvata accanto all'archivio in `<id>.zip.sha256`, in formato
  `sha256sum -c`; prima compariva solo nel popup. Se questo file non si salva, lo ZIP resta
  valido e il popup mostra un avviso con l'impronta.
- Contesto di rete esterno (facoltativo, disattivato di default, `<id>.netcontext.json`):
  titolari del dominio e della rete IP del server via RDAP, con il bootstrap ufficiale IANA,
  e record A, AAAA, CNAME, NS, MX, TXT e CAA via DNS-over-HTTPS (Cloudflare o Google). Il
  report indica se l'IP usato dal browser compare nel DNS; per i registri senza RDAP (es.
  `.it`) rimanda alla pagina whois del registro. Invia ai servizi solo nome host e IP.
- Cookie e storage (facoltativo, `<id>.storage.json`): cookie della pagina e dei frame,
  anche HttpOnly, e chiavi di localStorage e sessionStorage, con SHA-256 e lunghezza dei
  valori. Valori in chiaro solo con un'opzione esplicita nelle Impostazioni, con avviso.
- Report HTML (`<id>.report.html`, attivo di default): stesso contenuto del report di testo
  in una pagina moderna e stampabile, con sintesi, indicatori di stato, tabella dei file
  collegati, registro come linea temporale e comandi di verifica. Nessuno script né risorsa
  esterna (CSP), tutti i valori sottoposti a escape. Incluso nel manifest.
- Bozza per l'invio tramite PEC (`<id>.pec.eml`, facoltativa): manifest e report allegati,
  impronta del manifest nel testo, destinatario configurabile. Si apre come bozza in Outlook
  o Thunderbird; la ricevuta di consegna dà una data certa all'invio del manifest.
- Nuova sezione delle Impostazioni *Contesto di rete, cookie e PEC*.

### Modificato

- Copertina del PDF rinnovata: intestazione con striscia di colore e badge (SHA-256,
  RFC 3161, esito TLS, riferimento del caso), sezioni con segno di colore, righe a bande e
  note in un riquadro. Resta su una sola pagina come prima.
- Report di testo e HTML generati dalle stesse sezioni; il testo resta invariato.

### Test

- Regressioni per testo e link, catena PEM, sistema operativo e impronta dello ZIP; il
  test in Chromium controlla anche testo e link letti dalla pagina.
- Il test in Chromium avvia il browser in inglese, così passa anche su sistemi in altre lingue,
  e verifica la raccolta reale di un cookie HttpOnly e di una voce di localStorage.
- Regressioni per RDAP e DNS con servizi simulati (bootstrap solo https, suffissi di secondo
  livello, registri senza RDAP, CIDR IPv4/IPv6), per l'assenza di connessioni esterne con le
  impostazioni predefinite, per cookie e storage senza valori in nessun file, per il report HTML
  inerte e per la bozza PEC (MIME valido, allegato identico al manifest, nessuna intestazione
  iniettabile).

## [1.7.6] - 2026-11-05

### Corretto

- Rimosso il referral Satispay da Opzioni, codice e traduzioni; resta il sostegno
  volontario tramite nome utente pubblico copiabile, senza collegamenti promozionali.
- Informativa privacy chiarita sul trattamento locale, sui contenuti sensibili
  eventualmente acquisiti e sui dati tecnici osservabili dal servizio TSA.

### Aggiunto

- Materiale di presentazione per il Chrome Web Store in italiano e inglese, con
  motivazioni dei permessi, istruzioni per il revisore e dichiarazioni sul trattamento.
- Screenshot reali generati in Chromium e bundle di presentazione separato dallo ZIP
  installabile. La preparazione non implica approvazione o pubblicazione sullo store.

## [1.7.5] - 2026-11-05

### Aggiunto

- Riquadro discreto nelle Opzioni per sostenere volontariamente lo sviluppo tramite
  nome utente Satispay, con copia del nome utente e suggerimento di 1 € o importo libero.
- Invito Satispay separato e richiudibile, con copia del codice promozionale e link esterno.
- Testi in italiano, inglese, francese e spagnolo; nessuna nuova autorizzazione, richiesta
  automatica a Satispay o tracciamento. Informativa aggiornata.

## [1.7.3] - 2026-11-05

### Documentazione

- Esplicitati i limiti accettati dell'estensione autonoma: sandbox e VM sono misure
  esterne facoltative; i dati raccolti dal browser non attestano l'integrità dell'host.
- Allineati README, modello di sicurezza e procedura operativa sulla verifica TSA,
  sulle garanzie eIDAS, sull'isolamento e sui limiti dell'acquisizione.
- Corrette le indicazioni sulle protezioni del computer e sugli IP osservati.
- Nessuna nuova funzione di isolamento o virtualizzazione inclusa in questa versione.

## [1.7.2] - 2026-11-05

### Corretto

- Gestione degli errori del popup: eliminato il conflitto fra messaggio ricevuto e
  funzione di traduzione che interrompeva la risposta e l'aggiornamento dello stato.
- HAR: i corpi dei redirect non vengono più confusi con la risposta finale.
- Registrazione HAR estesa fino al termine degli snapshot, incluso lo scorrimento;
  intervallo, timeout, limiti e richieste incomplete sono espliciti nel report e nell'HAR.
- Limite di richieste applicato anche alle richieste ancora aperte, con conteggio degli scarti.

### Aggiunto

- Test dell'estensione in Chromium con fixture HTTP locali per redirect, scorrimento,
  hash dei contenuti e download completati o interrotti.
- Pubblicazione automatica al merge di una PR interna `release/<versione>` su `main`,
  oltre alla pubblicazione tramite tag.

## [1.7.1] - 2026-11-05

### Aggiunto

- Larghezze simulate A4: 794 px (verticale) e 1123 px (orizzontale), a 96 dpi.

## [1.7.0] - 2026-11-05

### Aggiunto

- Registro HAR 1.2 (`<id>.har`) di tutte le richieste fatte dalla pagina durante la
  ricarica, con SHA-256 del contenuto di ogni risposta e contenuti incorporati entro 10 MB
  ciascuno e 50 MB in tutto; cookie e autorizzazioni oscurati. Incluso nel manifest.
- Integrità dell'ambiente: impronta SHA-256 del codice dell'estensione nel report e in
  copertina, pubblicata anche nella release (`code-fingerprint-<versione>.txt`,
  `tools/build.py --fingerprint`). Elenco facoltativo delle altre estensioni attive con
  avviso per quelle che possono modificare le pagine (permesso facoltativo `management`).
- Cronologia facoltativa della scheda (ultime 10 pagine) per documentare come si è arrivati
  alla pagina.
- Indicazione del servizio di marca temporale qualificato eIDAS (Aruba preimpostato).
- Procedura operativa di acquisizione in `docs/PROCEDURA.md`.

- Catena di custodia: operatore e organizzazione (Impostazioni), riferimento del caso e
  motivo/note (popup, sezione "Dati del caso"). Compaiono in copertina, nel report di testo
  e in `report.json` (`custody`), quindi sono vincolati da manifest e marca temporale.
  Opzione per renderli obbligatori.
- Registro delle operazioni con ora UTC di ogni passo (collegamento del debugger, ricarica,
  risposta, controllo TLS, impaginazione, screenshot, copie, hash dei reperti, report) nel
  report e in `report.json` (`log`). Manifest e richiesta TSA sono registrati nella
  ricevuta `<id>.timestamp.json` (`log`).

## [1.6.0] - 2026-11-05

### Aggiunto

- Copia PDF per la stampa (`<id>.print.pdf`, facoltativa): lo screenshot adattato alla
  larghezza A4 e diviso in fasce sovrapposte di 20 px, con intestazione, numero di pagina
  e, su ogni foglio, nome e SHA-256 del PDF digitale di riferimento. È inclusa in report,
  manifest e marca temporale. Orientamento A4 verticale o orizzontale (Impostazioni >
  Avanzate); l'orizzontale ingrandisce il testo di circa il 40%.

### Corretto

- Avvisi, note ed errori del popup sono salvati come chiavi di traduzione e mostrati nella
  lingua impostata al momento della lettura, anche se la lingua cambia dopo la cattura.
- Il tooltip dell'icona segue la lingua scelta nelle impostazioni, non solo quella del browser.

### Modificato

- Nuovo nome: **Forensic Web Capture** (prima "Full Page Screenshot"); pacchetto
  `forensic-web-capture-<versione>.zip`. Gli identificatori di schema dei report
  (`full-page-screenshot/report@2`, `timestamp@1`) restano invariati per compatibilità.

### Sicurezza e integrità

- Nomi dei file basati su UUID e comandi di verifica con quoting esplicito.
- HTML esportato come sorgente inerte, senza interpretazione del DOM acquisito.
- Marca RFC 3161 sul manifest comprendente reperti e report; ricevuta TSA separata.
  Il riepilogo finale include anche report, manifest, token e ricevuta.
- Parser DER con controlli di lunghezza, struttura, algoritmo, nonce obbligatorio e policy.
  Interfaccia e report distinguono ricezione della risposta dalla verifica esterna della firma.
- Download confermati solo al completamento; errori, rinomine e timeout sono segnalati.
- Suite di regressione e verifica con TSA OpenSSL locale, eseguite in CI e prima del rilascio.
- Rilevamento dell'intercettazione TLS da software locale (antivirus, VPN, proxy): SCT di
  Certificate Transparency assenti, emittente noto, certificato appena generato. Con i dati
  di rete attivi la cattura si sospende e il popup propone "Ricontrolla" o "Acquisisci
  comunque"; esito, segnali ed eventuale conferma dell'utente finiscono in report e copertina.
  Disattivabile in Impostazioni > Avanzate.
- Cattura consentita solo su pagine `http:`, `https:` e `file:` (allowlist al posto della
  lista di schemi vietati).
- Comandi accettati solo dal popup dell'azione: percorso esatto, nessuna query, nessuna scheda.
- Nome dell'header personalizzato della TSA validato come token HTTP; header riservati
  (`Host`, `Content-Type`, `Authorization`, `Cookie`, `Sec-*`, `Proxy-*`…) rifiutati.
- Avviso nelle opzioni se l'URL della TSA punta a una rete locale o privata.
- Verifica della firma della marca temporale: impronta, `signingCertificate`, firma RSA/RSA-PSS/ECDSA
  e catena fino alle radici di DigiCert, Sectigo e FreeTSA (incluse) o a CA aggiunte nelle opzioni.
  Esito `verified`/`untrusted`/`invalid`/`unsupported` in popup, test del servizio e ricevuta.
  La revoca dei certificati non è controllata.
- Il rifiuto della TSA riporta il motivo inviato dal servizio (`statusString`, `failInfo`).
- Timeout per il job di rilascio in CI.

### Compatibilità browser

- Istruzioni di installazione per Edge e Brave (stesso pacchetto di Chrome).
- Il report indica il browser effettivo (Chrome, Edge, Brave, Opera) oltre allo user agent.
- `tools/build.py` crea anche la cartella estratta in `dist/`, pronta da caricare.

### Compatibilità

- Report JSON `full-page-screenshot/report@2`; esito TSA in `<id>.timestamp.json`.
- La verifica OpenSSL usa `<id>.manifest.sha256` come bersaglio per le nuove acquisizioni.
- Il file HTML mostra il codice sorgente come testo; per la copia della pagina resta l’MHTML.

## [1.5.0] - 2026-11-04

### Aggiunto

- Interfaccia, messaggi, report e pagina di copertina in inglese, italiano, francese e spagnolo.
  La lingua si sceglie nelle Impostazioni (predefinita: quella del browser).
- Nome e descrizione dell'estensione tradotti nel manifest (`_locales`).
- Nel report JSON, campo `language` e codice stabile `type` per ogni file.

### Corretto

- La pagina di copertina poteva continuare su una seconda pagina: ora si adatta per stare in
  una sola, riducendo se serve caratteri e spaziature. Gli elenchi molto lunghi (nomi del
  certificato, redirect) e i valori lunghissimi vengono accorciati in copertina, con rimando al
  report che li riporta per intero.

## [1.4.0] - 2026-11-04

Prima versione completa, non pubblicata.

### Aggiunto

- Autore, licenza MIT, documentazione e workflow di release.
- Versione e crediti nella pagina Impostazioni.
- Script `tools/build.py` per creare il pacchetto.
- Configurazione separata per ogni servizio di marca temporale.
- Sottocartella di Download configurabile.
- Esito dell'ultima cattura conservato e mostrato riaprendo il popup, con badge sull'icona.
- Servizio di marca temporale configurato indicato nel popup.
- Indicatore di modifiche non salvate e pulsante *Ripristina predefiniti* nelle Impostazioni.
- Altezza massima catturata configurabile.
- `SECURITY.md` con modello di sicurezza e procedura di segnalazione.

### Sicurezza

- Le credenziali della TSA non vengono più salvate in chiaro: restano in memoria fino alla
  chiusura del browser oppure vengono cifrate con una password di protezione (AES-256-GCM,
  PBKDF2-SHA256 a 600.000 iterazioni). Quelle delle versioni precedenti vengono spostate in
  memoria e cancellate dal disco.
- Lo scorrimento e la lettura dell'HTML avvengono in un mondo JavaScript isolato: la pagina non
  può più falsificare l'HTML salvato né bloccare la cattura ridefinendo funzioni del browser.
- Timeout su tutte le operazioni eseguite nella pagina.
- URL e titolo del report sono quelli effettivi al momento dello screenshot; il cambio di
  indirizzo durante la cattura viene segnalato.
- L'HTML salvato contiene una Content-Security-Policy che impedisce l'esecuzione di script e il
  caricamento di risorse esterne all'apertura.
- I valori dei cookie (`Set-Cookie`) e le password negli URL vengono rimossi dai report.
- Caratteri di controllo e di direzione del testo rimossi da nomi di file e report.
- Richieste alla TSA senza redirect né cookie, con timeout e dimensione massima della risposta;
  credenziali mai inviate via `http`.
- Il service worker accetta comandi solo dal popup dell'estensione.
- Content-Security-Policy restrittiva per le pagine dell'estensione.
- Workflow di release con permessi minimi, azioni fissate a un commit e hash del pacchetto.

### Corretto

- Cambiando servizio di marca temporale, le credenziali del precedente venivano inviate al nuovo.
- Credenziali e header potevano essere inviati in chiaro a servizi `http`: ora la richiesta viene bloccata.
- Un secondo clic durante una cattura in corso ne avviava un'altra in conflitto.
- L'attesa dopo il ridimensionamento non accettava il valore 0.
- Il popup poteva sovrascrivere le impostazioni salvate nel frattempo dalla pagina Impostazioni.

## [1.3.2] - 2026-11-04

### Corretto

- Scarto dell'orologio calcolato in modo errato quando la pagina arriva dalla cache di una CDN:
  ora si usa `Date` + `Age`.

## [1.3.1] - 2026-11-04

### Aggiunto

- Confronto dell'orologio del PC con il server e con la TSA, con avviso nel popup oltre 10 s.

### Corretto

- Il report JSON includeva per errore il contenuto binario dei file (decine di MB).
- La copertina occupava una pagina in più per poche righe di note.

## [1.3.0] - 2026-11-04

### Aggiunto

- Interruttori nel popup per ogni funzione e pagina Impostazioni.
- Pagina di copertina nel PDF.
- Salvataggio MHTML e HTML.
- Dati di rete: risposta HTTP, IP, redirect, header, certificato TLS.
- Marca temporale RFC 3161 con TSA configurabile (credenziali, header, policy OID).
- Report JSON e archivio ZIP con `SHA256SUMS.txt`.
- Scorrimento automatico prima della cattura.
- Icona dell'estensione.

## [1.2.0] - 2026-11-04

### Corretto

- Sui siti che disegnano solo la parte visibile (es. Reddit) lo screenshot ripeteva la stessa
  porzione: ora la finestra simulata viene allargata all'altezza dell'intera pagina.

## [1.1.0] - 2026-11-04

### Aggiunto

- Formato PDF.
- Report con hash SHA-256 e data/ora dell'acquisizione.

## [1.0.0] - 2026-11-04

### Aggiunto

- Screenshot della pagina intera in PNG o JPEG con larghezza simulata.

[1.8.1]: ../../releases/tag/v1.8.1
[1.8.0]: ../../releases/tag/v1.8.0
[1.7.6]: ../../releases/tag/v1.7.6
[1.7.5]: ../../releases/tag/v1.7.5
[1.7.3]: ../../releases/tag/v1.7.3
[1.7.2]: ../../releases/tag/v1.7.2
[1.7.1]: ../../releases/tag/v1.7.1
[1.7.0]: ../../releases/tag/v1.7.0
[1.6.0]: ../../releases/tag/v1.6.0
[1.5.0]: ../../releases/tag/v1.5.0
