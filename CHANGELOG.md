# Changelog

Tutte le modifiche rilevanti del progetto. Il formato segue
[Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il
[Semantic Versioning](https://semver.org/lang/it/).

## [1.6.0] - Non rilasciata

### Aggiunto

- Copia PDF per la stampa (`<id>.print.pdf`, facoltativa): lo screenshot adattato alla
  larghezza A4 e diviso in fasce sovrapposte di 20 px, con intestazione, numero di pagina
  e, su ogni foglio, nome e SHA-256 del PDF digitale di riferimento. È inclusa in report,
  manifest e marca temporale.

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

[1.5.0]: ../../releases/tag/v1.5.0

