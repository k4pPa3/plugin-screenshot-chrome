# Scheda Chrome Web Store — Italiano

## Nome

Forensic Web Capture

## Descrizione breve

Acquisisci pagine web con screenshot, report e hash SHA-256. Elaborazione locale e marca temporale opzionale.

## Descrizione completa

Forensic Web Capture crea acquisizioni documentate delle pagine web scelte dall'utente,
con file e report salvati sul suo computer.

- Screenshot della pagina intera in PDF, PNG o JPEG, con limite di altezza configurabile.
- Copertina e copia PDF A4 per la stampa, anche orizzontale.
- Salvataggio facoltativo della pagina in MHTML, del sorgente HTML come testo inerte e del
  testo visibile con l'elenco dei link.
- Raccolta facoltativa di risposte HTTP, redirect, indirizzi dei server, certificato TLS
  e risorse di rete in formato HAR, con limiti e contenuti mancanti documentati.
- Cookie e storage della pagina, facoltativi, con i valori ridotti di default a impronta SHA-256.
- Contesto di rete esterno facoltativo: dati pubblici di registrazione del dominio e della
  rete IP (RDAP) e record DNS tramite DNS-over-HTTPS. Disattivato di default; contatta IANA,
  i registri e il servizio DNS scelto.
- Report testuale, HTML e JSON, hash SHA-256 dei file, manifest e pacchetto ZIP.
- Bozza di messaggio (.eml) facoltativa per inviare il manifest tramite PEC.
- Campi operatore, organizzazione e riferimento del caso; registro delle operazioni.
- Marca temporale RFC 3161 opzionale presso un servizio scelto dall'utente, con verifica
  della firma e della catena dei certificati. Il servizio può richiedere un contratto.

Le acquisizioni vengono elaborate localmente e non vengono inviate allo sviluppatore.
Se attivata, la marca temporale trasmette al fornitore TSA l'hash del manifest e un nonce,
oltre alle credenziali configurate. Il fornitore vede i normali metadati della connessione.
Se è attivo il contesto di rete esterno, dominio e IP del server vengono inviati ai servizi
pubblici RDAP e DNS.
La navigazione nella pagina resta soggetta alle normali connessioni del browser al sito.

La cattura e il collegamento del debugger iniziano solo su richiesta dell'utente.
La raccolta di rete ricarica la pagina e può modificarne i contenuti dinamici.
Le pagine interne del browser e alcuni schemi non sono supportati.

Gli hash consentono di verificare modifiche successive ai file. Lo strumento non certifica
la veridicità del sito, l'integrità del computer o l'ammissibilità della prova.
La verifica TSA non comprende revoca OCSP/CRL o qualificazione eIDAS tramite liste fiduciarie.

Il programma è utilizzabile gratuitamente. Le Opzioni mostrano un nome utente Satispay per
sostenere facoltativamente lo sviluppo, con 1 € o con un importo libero. Il contributo non
sblocca funzioni e non viene gestito o misurato dall'estensione. Non sono presenti referral.

## Categoria suggerita

Strumenti per sviluppatori. Confermare la categoria più aderente disponibile nel pannello.

## Collegamenti

- Sito/progetto: https://github.com/k4pPa3/plugin-screenshot-chrome
- Supporto: https://github.com/k4pPa3/plugin-screenshot-chrome/issues
- Privacy: https://github.com/k4pPa3/plugin-screenshot-chrome/blob/main/PRIVACY.md
