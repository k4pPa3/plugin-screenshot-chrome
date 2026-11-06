# Informativa sulla privacy — Forensic Web Capture

*Ultimo aggiornamento: 6 novembre 2026 — funzionalità verificate sulla versione in sviluppo successiva alla 1.7.6*

## Ambito e sviluppatore

Forensic Web Capture è un'estensione per Google Chrome sviluppata da **Andrea Martin**.
Serve a creare, su richiesta dell'utente, acquisizioni documentate delle pagine web,
con file salvati sul suo computer e marca temporale RFC 3161 facoltativa.

**Lo sviluppatore non riceve le acquisizioni, le impostazioni o le credenziali.**
L'estensione non usa server dello sviluppatore, account propri, analytics, telemetria
di utilizzo o sistemi pubblicitari. Non vende i dati trattati.

L'estensione legge ed elabora dati sul dispositivo per svolgere queste funzioni:
il fatto che i dati restino locali non significa che non vengano trattati.

## Quali dati vengono trattati e perché

| Dati | Quando e per quale scopo | Destinazione |
|---|---|---|
| Contenuti dei siti web | Quando avvii un'acquisizione: aspetto della pagina e, secondo le opzioni abilitate, HTML, testo visibile e link, MHTML e contenuti delle risposte di rete. Servono a documentare la pagina scelta. | File di acquisizione sul tuo computer. |
| URL, titoli e navigazione | URL e titolo della pagina acquisita; redirect se rilevati dai dati di rete. Se abiliti la cronologia della scheda, fino a dieci voci, compresa quella corrente, con URL, titolo e tipo di navigazione. | Report e file locali; URL e titolo dell'ultima acquisizione anche nello stato temporaneo dell'estensione. |
| Dati identificativi inseriti dall'operatore | Operatore, organizzazione, riferimento del caso e note, se compilati. Servono a descrivere chi ha eseguito l'acquisizione e il relativo contesto. | Impostazioni locali e report. |
| Dati di autenticazione TSA | Nome utente, password o header personalizzato configurati per il servizio di marca temporale. Servono ad autenticare la richiesta quando il servizio lo richiede. | Impostazioni o memoria di sessione, come precisato sotto; credenziali inviate al servizio TSA selezionato soltanto tramite HTTPS. |
| Attività di rete della pagina | Se abiliti i dati di rete e il registro HAR: richieste e risposte, URL, metodi, stato HTTP, intestazioni, tempi, redirect e contenuti recuperabili entro i limiti previsti. Il monitoraggio riguarda l'acquisizione richiesta. | Report e HAR locali. |
| Ambiente tecnico | Data e ora, fuso orario configurato, browser e versione, user agent, dimensioni dell'acquisizione e impronta del codice dell'estensione. Se abiliti l'inventario e concedi il permesso facoltativo, identificativi, nomi, versioni, tipo di installazione e indicatori dei permessi delle altre estensioni attive. | Report locali, per documentare l'ambiente di acquisizione. |
| Informazioni sul server | Con i dati di rete: indirizzi IP e porte dei server remoti e informazioni HTTP/TLS disponibili, compreso il certificato del sito e la sua catena. | Report, HAR e file `.cert.pem` locali. Gli IP dei server non sono una misura della tua posizione. |
| Cookie e storage della pagina | Se abiliti *Cookie e storage*: nome, dominio, percorso, scadenza e attributi dei cookie della pagina e dei suoi frame (anche HttpOnly), chiavi di localStorage e sessionStorage dell'origine. Dei valori si salva di default solo l'impronta SHA-256 e la lunghezza; i valori in chiaro solo se attivi l'apposita opzione nelle Impostazioni. | File `.storage.json` locale e sintesi nei report. |
| Titolari di dominio e rete, DNS | Se abiliti il *Contesto di rete esterno*: dati pubblici di registrazione del dominio e della rete IP del server (RDAP) e record DNS del dominio. | File `.netcontext.json` locale e sintesi nei report. |
| Bozza PEC | Se abiliti la bozza: un file `.eml` con manifest e report allegati e l'eventuale destinatario configurato. L'estensione non spedisce messaggi. | File locale, finché non lo invii tu con il tuo programma di posta. |

Non viene richiesto l'accesso alla posizione GPS né viene effettuata una ricerca della
posizione del dispositivo. Non vengono registrati tasti premuti, movimenti del mouse o
clic per finalità di analisi dell'utilizzo. L'estensione non monitora continuativamente
la navigazione: l'acquisizione viene avviata dall'utente nella scheda scelta.

### Dati già presenti nella pagina

La pagina che scegli può contenere dati personali tuoi o di altre persone, email o
conversazioni, informazioni sanitarie, finanziarie o di autenticazione. Questi dati
possono essere conservati nei file acquisiti come parte del contenuto della pagina;
l'estensione non li ricerca per creare profili o svolgere analisi commerciali.

Nel registro HAR sono oscurati i valori degli header Cookie, Set-Cookie,
Authorization e Proxy-Authorization. Questo **non equivale a una bonifica generale**:
URL e relativi parametri, altri header, screenshot, HTML, MHTML e corpi delle risposte
possono ancora contenere dati personali, segreti o token. Verifica i file prima di
condividerli. Per acquisire pagine pubbliche puoi usare un profilo dedicato o una
finestra in incognito, se hai autorizzato l'estensione a funzionare in tale modalità.

## Dove e per quanto tempo restano i dati

- **File acquisiti:** sono salvati tramite il browser nella cartella Download o nella
  destinazione scelta, eventualmente nella sottocartella configurata. Restano finché
  li elimini tu; l'estensione non applica una scadenza né li cifra automaticamente.
  Un file ZIP prodotto dall'estensione non è un archivio cifrato.
- **Impostazioni:** preferenze, dati della catena di custodia, URL TSA, nome utente e
  configurazioni dei servizi restano in chrome.storage.local, senza sincronizzazione
  tramite chrome.storage.sync, finché li modifichi, li cancelli o rimuovi l'estensione.
  Il nome utente TSA e le impostazioni non sono protetti dal vault delle password.
- **Password e valore dell'header TSA:** normalmente restano in chrome.storage.session.
  Se scegli il salvataggio cifrato, una copia viene conservata localmente con
  AES-256-GCM e chiave derivata dalla password di protezione mediante PBKDF2-SHA256.
  Dopo lo sblocco, segreti e chiave utilizzabile restano nella memoria di sessione.
  La password di protezione non viene salvata nelle impostazioni.
- **Stato dell'ultima acquisizione:** esito, URL, titolo, hash, nomi dei file e avvisi
  disponibili restano nella memoria di sessione per poter riaprire il popup e vedere
  il risultato. Non costituiscono un archivio delle acquisizioni.

La memoria chrome.storage.session viene cancellata al riavvio del browser e quando
l'estensione viene disabilitata, ricaricata o aggiornata. Chiudere soltanto il popup
non cancella la sessione.

## Connessioni esterne e marca temporale facoltativa

Con la marca temporale attiva, l'estensione contatta il servizio **TSA selezionato
dall'utente**, dopo la concessione del relativo permesso. Per un'acquisizione invia
l'hash SHA-256 del manifest che elenca reperti e report, un numero casuale (*nonce*),
l'eventuale identificativo di policy e le credenziali configurate per quel servizio.
Il pulsante di prova della TSA invia invece una richiesta con un hash di test.

**La richiesta TSA non contiene screenshot, HTML, MHTML, HAR, report, manifest completo
o URL della pagina acquisita.** Il servizio riceve la richiesta e può osservare
l'indirizzo IP della connessione e i metadati tecnici. Non vengono allegati i cookie
del browser alla richiesta TSA. Il servizio applica la propria informativa e i propri
tempi di conservazione, che non sono controllati dallo sviluppatore dell'estensione.

L'endpoint predefinito FreeTSA usa HTTPS. Sono supportati anche endpoint HTTP senza
credenziali: in quel caso la richiesta non beneficia della cifratura HTTPS.
L'estensione rifiuta l'invio di credenziali via HTTP. Preferisci un endpoint HTTPS.

## Connessioni del contesto di rete esterno (facoltativo)

Il *Contesto di rete esterno* è **disattivato di default**. Se lo attivi, dopo la
cattura l'estensione interroga via HTTPS, senza cookie e senza referrer:

- **IANA** (`data.iana.org`), per sapere quale servizio RDAP gestisce il dominio e l'IP;
- il **registro del dominio** (ad esempio Verisign per `.com`), a cui invia il nome di
  dominio della pagina;
- il **registro regionale degli indirizzi IP** (ad esempio RIPE NCC o ARIN), a cui invia
  l'indirizzo IP del server;
- il servizio **DNS-over-HTTPS** scelto nelle Impostazioni (Cloudflare o Google), a cui
  invia il nome di dominio e il tipo di record richiesto.

Non vengono inviati il percorso o i parametri dell'URL, il contenuto della pagina, i
reperti o i dati della catena di custodia. Questi servizi possono però osservare il
dominio e l'IP che stai documentando, oltre all'indirizzo IP della tua connessione, e
applicano le proprie informative. Se l'indagine è riservata, valuta se attivare la
funzione.

Separatamente, il normale caricamento della pagina, la ricarica necessaria ai dati
di rete e il caricamento di risorse durante lo scorrimento possono contattare il sito
e i suoi fornitori, usando la sessione del browser. Queste connessioni seguono le
impostazioni del browser e le informative dei siti interessati.

## Controllo e cancellazione

Puoi disattivare le funzioni facoltative prima dell'acquisizione e modificare o svuotare
i campi della catena di custodia nel popup e nelle Opzioni. Il ripristino nelle Opzioni
elimina i profili TSA, il vault e i segreti della sessione, ma **non cancella i dati
della catena di custodia né i file già scaricati**.

Per eliminare tutte le impostazioni locali puoi rimuovere l'estensione dal browser.
Per eliminare le acquisizioni devi cancellare separatamente i file, gli eventuali
archivi, le copie condivise e i backup che hai creato. La cancellazione della sola
cronologia di navigazione non elimina le impostazioni dell'estensione.
Lo sviluppatore non può accedere ai dati rimasti sul tuo dispositivo né cancellarli
da remoto. La gestione delle copie trasferite a terzi resta sotto il tuo controllo.

## Supporto volontario Satispay

Le Opzioni mostrano il nome utente pubblico Satispay dello sviluppatore per un
contributo facoltativo. Il pulsante di copia scrive negli appunti soltanto quel nome.
Il riquadro non contiene referral o link promozionali, non carica risorse esterne e
non misura visualizzazioni, clic o pagamenti. L'estensione non avvia trasferimenti
e non riceve informazioni sui contributi. L'eventuale pagamento avviene separatamente
nell'app Satispay, secondo le sue condizioni e la sua informativa.

## Uso limitato dei dati

L'uso delle informazioni ottenute tramite le API di Chrome rispetta la
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
compresi i requisiti di
[Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
I dati sono utilizzati soltanto per le funzioni di acquisizione documentata e marca
temporale descritte. Non vengono venduti o utilizzati per pubblicità, profilazione,
valutazione dell'affidabilità creditizia o concessione di prestiti. Le acquisizioni
non vengono inviate allo sviluppatore o a un suo servizio di analisi.

## Contatti e aggiornamenti

Per domande sull'estensione o sull'informativa puoi contattare Andrea Martin tramite
le [Issues del progetto](https://github.com/k4pPa3/plugin-screenshot-chrome/issues).
Le segnalazioni sono pubbliche: non allegare credenziali, acquisizioni riservate o dati
personali non necessari. L'informativa viene aggiornata quando cambiano le modalità
di trattamento; la data e la versione di riferimento sono indicate all'inizio.
