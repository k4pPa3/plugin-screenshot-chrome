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
- **Larghezza simulata**: finestra attuale, 1920, 1366, 1123 (A4 orizzontale), 1024, 794 (A4)
  o 390 px (mobile). Le larghezze A4 rendono la pagina come su un foglio e ottimizzano la copia per la stampa.
- **Formati**: PDF, PNG o JPEG. Nel PDF lo screenshot è incorporato così com'è; le pagine molto alte
  vengono divise su più pagine PDF senza perdere nulla.
- **Pagina di copertina** nel PDF con URL, data/ora, browser, dati di rete e hash dei file correlati.
- **Copia PDF per la stampa**: lo stesso screenshot impaginato su fogli A4 (verticali o orizzontali)
  con fasce sovrapposte, numero di pagina e, su ogni foglio, l'hash del PDF digitale di riferimento.
- **Report di acquisizione** in testo, in HTML (leggibile e stampabile, senza script né risorse
  esterne) e facoltativamente in JSON, inclusi nel manifest SHA-256 insieme ai reperti.
- **Copia della pagina** in MHTML (si riapre in Chrome) e sorgente HTML visualizzato come testo inerte.
- **Testo visibile e link** della pagina in un file di testo ricercabile, accanto allo screenshot.
- **Cookie e storage** della pagina (anche HttpOnly, localStorage e sessionStorage): nomi e
  attributi, con i valori ridotti di default a impronta SHA-256 perché sono credenziali.
- **Contesto di rete esterno** (facoltativo, disattivato di default): titolari del dominio e
  della rete IP del server via RDAP, record DNS via DNS-over-HTTPS e confronto fra l'IP usato
  dal browser e quelli del DNS.
- **Dati di rete**: IP del server, risposta HTTP, redirect, header, certificato TLS con la sua
  impronta e la catena completa in PEM.
- **Rilevamento dell'intercettazione TLS**: se un antivirus, una VPN o un proxy ispeziona HTTPS
  (il certificato registrato non sarebbe quello del sito), la cattura si sospende e propone di
  disattivare la protezione e ricontrollare, oppure di acquisire comunque con avviso nel report.
- **Confronto indicativo dell'orologio del PC** con il server; l’ora dichiarata dalla TSA è mostrata come non verificata.
- **Marca temporale RFC 3161** con qualsiasi servizio (TSA) compatibile, anche con credenziali o API key.
- **Bozza per l'invio tramite PEC** (`.eml`) con manifest e report allegati, come alternativa o
  complemento alla marca temporale.
- **Catena di custodia**: operatore, organizzazione, riferimento del caso e motivo, inclusi in
  report e copertina e quindi coperti dalla marca temporale; facoltativamente obbligatori.
- **Registro delle operazioni** con l'ora UTC di ogni passo dell'acquisizione.
- **Registro HAR** delle risorse osservate, con SHA-256 dei contenuti recuperabili e limiti documentati.
- **Integrità dell'ambiente**: sistema operativo, impronta del codice dell'estensione, confrontabile con quella
  pubblicata nella release, ed elenco facoltativo delle altre estensioni attive.
- **Cronologia della scheda** (facoltativa) per documentare come si è arrivati alla pagina.
- **Un solo salvataggio per acquisizione**. Più file vengono raccolti in uno ZIP. Il popup
  mostra l'impronta SHA-256 dell'archivio.

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

### Aggiornare un’installazione da cartella

In **Impostazioni → Aggiornamenti**, premi **Verifica aggiornamenti** e consenti l’accesso a
GitHub quando richiesto. Se c’è una versione più recente, **Scarica ZIP** scarica il pacchetto
dell’estensione dopo aver verificato dimensione e SHA-256 pubblicati da GitHub. Estrai i file nella cartella già caricata, sovrascrivili e premi ↻ nella
pagina delle estensioni del browser. Usare la stessa cartella conserva l’identità
dell’estensione e le impostazioni locali. Per le installazioni da Chrome Web Store,
Chrome gestisce gli aggiornamenti.

## Uso

Clicca l'icona dell'estensione (o premi <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>), scegli
le funzioni desiderate, poi premi **Cattura pagina intera**. Per salvare solo la pagina in
MHTML, lascia attiva soltanto la relativa opzione. Chrome chiede la destinazione una volta.
Se hai scelto più file, li raccoglie l’estensione in uno ZIP. Il popup mostra l’esito, le
impronte e gli eventuali avvisi dopo la conferma del salvataggio.

Durante la cattura Chrome mostra la barra *"Forensic Web Capture ha avviato il debug di questo
browser"*: è normale, perché l'estensione usa il Chrome DevTools Protocol, e sparisce a fine cattura.

### Funzioni

| Interruttore | Cosa fa |
|---|---|
| Salva uno screenshot | Crea il file nel formato PDF, PNG o JPEG selezionato |
| Pagina di copertina | Aggiunge al PDF una prima pagina con i dati dell'acquisizione (solo PDF) |
| Copia PDF per la stampa | Salva anche `<id>.print.pdf` in fogli A4, adatto alla stampa (solo PDF) |
| Scorri la pagina prima della cattura | Scorre fino in fondo per caricare le immagini *lazy* |
| Salva pagina completa (MHTML) | Salva la pagina in un unico file riapribile in Chrome |
| Salva sorgente HTML | Salva una pagina di consultazione che mostra il DOM come testo inerte, senza interpretarlo come markup |
| Salva testo visibile e link | Salva `<id>.text.txt` con il testo della pagina come lo legge chi la guarda e l'elenco dei link (documento principale, non gli iframe) |
| Dati di rete e certificato | **Ricarica la pagina** e registra risposta HTTP, IP, redirect, header e certificato TLS; salva la catena in `<id>.cert.pem` |
| Registro HAR delle risorse osservate | Con i dati di rete, salva `<id>.har` con ogni richiesta e risposta e l'SHA-256 dei contenuti |
| Copia HAR per la condivisione | Con il registro HAR, aggiunge `<id>.share.har` con stati HTTP, tempi e dimensioni. Per la condivisione, estrai solo questa copia dallo ZIP. Il registro originale può contenere credenziali |
| Contesto di rete esterno | Dopo la cattura interroga RDAP (IANA, registro del dominio, registro degli IP) e un servizio DNS-over-HTTPS; salva `<id>.netcontext.json`. **Contatta servizi esterni** |
| Cookie e storage | Salva `<id>.storage.json` con cookie della pagina e dei frame, localStorage e sessionStorage; dei valori solo l'impronta SHA-256, salvo diversa scelta nelle Impostazioni |
| Marca temporale RFC 3161 | Invia l’hash del manifest (reperti e report) alla TSA; salva token `.tsr` ed esito `.timestamp.json` |
| Salva il report di testo (TXT) | Salva il report leggibile con dati e impronte |
| Report anche in JSON | Salva il report anche in formato leggibile dalle macchine |
| Report anche in HTML | Salva `<id>.report.html`, lo stesso report impaginato per lo schermo e la stampa (attivo di default) |
| Bozza per invio tramite PEC | Include nello ZIP `<id>.pec.eml`, da estrarre e aprire con il programma di posta configurato con la PEC |
| Salva i file delle impronte SHA-256 | Include il manifest e `SHA256SUMS.txt`. Marca temporale e bozza PEC includono comunque il manifest che utilizzano |
| Salva sempre come ZIP | Usa uno ZIP non compresso anche per un singolo file |

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
- **Contesto di rete, cookie e PEC**: servizio DNS-over-HTTPS (Cloudflare o Google), valori di
  cookie e storage in chiaro (sconsigliato), destinatario precompilato nella bozza PEC.
- **Avanzate**: qualità JPEG nel PDF, attesa dopo il ridimensionamento, tempo massimo di caricamento,
  altezza massima catturata, sottocartella di Download in cui salvare le acquisizioni,
  orientamento della copia per la stampa (A4 verticale o orizzontale, con testo più grande),
  controllo dell'intercettazione TLS prima di acquisire (attivo di default).

### Catena di custodia e registro

Operatore e organizzazione si impostano una volta nelle Impostazioni; riferimento del caso e
motivo/note si compilano nel popup (sezione **Dati del caso**) e restano fino alla modifica.
Con **Rendi obbligatori operatore e riferimento del caso** la cattura non parte senza.

Il report contiene il **registro delle operazioni**: ogni passo con ora UTC e dettagli
(stato HTTP, esito del controllo TLS, dimensioni, hash dei reperti). Il registro si chiude con
la composizione del report, che viene poi vincolato dal manifest; i passi successivi
(manifest, richiesta e risposta della TSA) sono nella ricevuta `<id>.timestamp.json`.

### Integrità dell'ambiente

Ogni report riporta l'**impronta del codice** dell'estensione: SHA-256 dell'elenco degli
hash dei suoi file. Ogni release pubblica la stessa impronta in `code-fingerprint-<versione>.txt`
(o `python tools/build.py --fingerprint` dal sorgente): se coincide, l'acquisizione è stata
fatta con il codice pubblicato, non modificato. Con *Elenca le altre estensioni attive*
(Impostazioni > Catena di custodia, richiede il permesso di gestione delle estensioni) il report
elenca anche le altre estensioni e avvisa se qualcuna può leggere o modificare le pagine.

Per l'uso forense segui la [procedura operativa](docs/PROCEDURA.md).

### Intercettazione TLS

Molti antivirus e VPN (es. NordVPN Threat Protection, Kaspersky, Avast, ESET) e i proxy aziendali
ispezionano HTTPS sostituendo il certificato del sito con uno generato da una CA installata sul PC.
In quel caso certificato e impronta nel report **non sono quelli del sito**. Con *Dati di rete*
attivo l'estensione lo rileva da tre segnali:

| Segnale | Significato |
|---|---|
| `no-sct` | Il certificato non ha SCT di Certificate Transparency (Chrome non li richiede alle CA locali) |
| `known-issuer` | L'emittente è un software di ispezione noto |
| `fresh-cert` | Il certificato è stato emesso meno di 24 ore prima |

Esito `likely` con emittente noto, o senza SCT e appena emesso; `suspected` solo senza SCT.
La cattura si ferma e il popup offre **Ricontrolla** (dopo aver disattivato la sola ispezione web:
la VPN può restare attiva) o **Acquisisci comunque**. Esito, segnali e scelta dell'utente sono
registrati in report, copertina e `report.json` (`network.tlsInterception`).

Ogni servizio di marca temporale ha la sua configurazione: cambiando servizio, le credenziali
dell'altro non vengono mai inviate. Credenziali e header non vengono mai inviati a servizi
`http`, dove viaggerebbero in chiaro, e non vengono mai scritti in chiaro su disco.

Se il popup si chiude durante la cattura, l'icona mostra l'esito (`OK`, `!` con avvisi, `ERR`)
e riaprendo il popup si ritrovano hash e avvisi dell'ultima acquisizione.

## File generati

Con tutte le funzioni attive, ogni acquisizione produce:

| File | Contenuto |
|---|---|
| `<id>.pdf` | Copertina + screenshot integrale (reperto di riferimento) |
| `<id>.print.pdf` | Copia in fogli A4 per la stampa, derivata dallo stesso screenshot |
| `<id>.mhtml` | Copia completa della pagina |
| `<id>.html` | Pagina HTML che mostra il sorgente DOM come testo inerte, con CSP restrittiva |
| `<id>.text.txt` | Testo visibile della pagina ed elenco dei link (password negli URL oscurate) |
| `<id>.har` | Registro di rete HAR 1.2: richieste, risposte, impronte e (entro 50 MB) contenuti |
| `<id>.netcontext.json` | Risposte RDAP di dominio e IP e risposte DNS, complete, con URL interrogati e orari |
| `<id>.storage.json` | Cookie (nome, dominio, scadenza, attributi) e chiavi di localStorage/sessionStorage, con SHA-256 e lunghezza dei valori |
| `<id>.cert.pem` | Catena dei certificati TLS del sito; si legge con `openssl x509 -in <id>.cert.pem -text -noout` |
| `<id>.tsr` | Risposta RFC 3161 relativa al manifest (token firmato dalla TSA) |
| `<id>.report.txt` | Report leggibile con dati, hash e istruzioni di verifica |
| `<id>.report.html` | Lo stesso report in una pagina HTML inerte, con collegamenti ai file |
| `<id>.report.json` | Lo stesso report in JSON |
| `<id>.manifest.sha256` | Hash di screenshot, copie della pagina e report; è il file sottoposto a marcatura |
| `<id>.timestamp.json` | Esito TSA, hash del manifest ed esito della verifica della firma (`verified`, `untrusted`, `invalid`, `unsupported`) con firmatario, catena e motivo, anche in caso di errore |
| `SHA256SUMS.txt` | Hash di tutti gli altri file nello ZIP, inclusi report, manifest, token e ricevuta |
| `<id>.pec.eml` | Bozza per la PEC con il manifest e, se selezionato, il report di testo. La bozza è nello ZIP e resta fuori dal manifest |

`<id>` è `capture_<data>_<UUID>`: il titolo della pagina resta nei metadati e non entra nei
nomi o nei comandi. Il popup mostra l’impronta SHA-256 dello ZIP dopo il salvataggio.

Il manifest viene creato **prima** della richiesta TSA: comprende anche i report immutabili,
che descrivono la richiesta e rimandano alla ricevuta separata per l’esito. Token e ricevuta
sono esclusi dal manifest per evitare dipendenze circolari. Se attivi i file delle impronte,
`SHA256SUMS.txt` comprende anche token, ricevuta e l’eventuale bozza PEC.
Lo schema JSON del report è `full-page-screenshot/report@2`.

Gli hash da soli rilevano variazioni rispetto a un riferimento conservato: non autenticano
l’autore. Per il legame temporale verificare la firma del token e gli hash del manifest.
Se la TSA fallisce, i reperti vengono comunque salvati con ricevuta di errore e avviso.

## Contesto di rete, cookie e PEC

**Contesto di rete esterno.** Un'estensione non può fare query DNS proprie né traceroute, e
il whois classico (porta 43) non è raggiungibile dal browser. Per questo la funzione usa:

- **RDAP**, il successore di whois: il file di bootstrap di IANA indica il servizio del
  registro del dominio e del registro regionale dell'IP. Alcuni registri (ad esempio `.it`,
  `.de`, `.eu`) non offrono RDAP: il report lo dice e rimanda alla pagina IANA con il whois del
  registro, che puoi acquisire a sua volta con l'estensione.
- **DNS-over-HTTPS** (Cloudflare o Google): A, AAAA, CNAME, NS, MX, TXT e CAA. È la vista di
  quel risolutore, non quella del tuo PC; l'IP effettivamente usato dal browser resta quello
  dei dati di rete, e il report indica se compare fra gli indirizzi del DNS.

Il dominio è individuato provando le ultime tre etichette del nome e poi le ultime due
(`bbc.co.uk`, `example.com`); il report riporta la query effettivamente usata. I servizi
interrogati vedono il dominio e l'IP indagati: attiva la funzione solo se è accettabile.

**Cookie e storage.** I valori dei cookie di sessione e i token nello storage sono credenziali:
chi riceve il pacchetto potrebbe usarli per entrare nell'account. Di default si salvano solo
SHA-256 e lunghezza di ogni valore, che permettono di dimostrare in seguito che un valore
coincideva senza averlo diffuso. L'impronta non protegge però valori brevi o prevedibili (un
numero, `yes`), che si possono ricavare per tentativi. Con i valori in chiaro, esci
dall'account dopo la cattura, così la sessione non è più valida.

**Invio tramite PEC.** In Italia la ricevuta di consegna della PEC dà una data certa,
opponibile a terzi, all'invio di un messaggio e dei suoi allegati. Inviando il manifest, che
contiene l'impronta di tutti i file, si ottiene una prova di esistenza simile alla marca
temporale. Un'estensione non può spedire email: la bozza `<id>.pec.eml` si apre in Outlook (come
messaggio da inviare) o in Thunderbird (*Modifica come nuovo messaggio*) con l'account PEC, anche
verso la propria casella. Conserva la **ricevuta di consegna completa** insieme all'acquisizione.
Rispetto alla marca RFC 3161 la PEC vale solo in Italia e non si verifica con strumenti standard:
usala come alternativa quando non hai una TSA, o meglio insieme alla marca temporale.

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
  Le informazioni sull'ambiente sono raccolte dal browser stesso e non costituiscono
  un'attestazione indipendente dell'integrità del sistema.
- Con *Dati di rete* attivo la pagina viene ricaricata: un modulo compilato a metà va perso, e i
  contenuti dinamici (pubblicità, feed) possono cambiare rispetto a quanto visto prima.
- Non sono inclusi: firma digitale dell'operatore sul manifest, video della sessione, controllo
  della revoca (OCSP/CRL), registrazioni WHOIS/DNS, PDF/A e contenitori ASiC-E.
  L'art. 41 eIDAS non esclude gli effetti giuridici e l'ammissibilità di una validazione
  temporale per il solo fatto che non sia qualificata; quella **qualificata** beneficia
  della presunzione di accuratezza di data e ora e di integrità dei dati associati.
  Nessuna marca certifica da sola la veridicità del contenuto o l'integrità del computer.
  L'esito `verified` riguarda firma e catena: non include revoca o verifica della
  qualificazione eIDAS mediante liste fiduciarie. Il preset del servizio non sostituisce
  tale verifica. Un'eventuale firma qualificata dell'operatore richiede strumenti e
  credenziali appropriati esterni all'estensione.
- Il registro HAR osserva le richieste dalla ricarica fino al termine di screenshot e
  snapshot, incluso lo scorrimento automatico. Riporta intervallo, timeout di caricamento,
  richieste incomplete e scartate (massimo 3000 richieste, compresi i redirect). I corpi
  non recuperabili, inclusi quelli dei redirect, sono segnalati senza attribuire loro
  il contenuto della risposta finale. I contenuti sono quelli
  decodificati dal browser, non una registrazione dei byte grezzi trasmessi. Il formato
  esportato è HAR; cambiare contenitore non recupererebbe dati non osservati dal browser.
- Se la connessione è ispezionata da software locale e si sceglie *Acquisisci comunque*, i dati
  del certificato descrivono il software di ispezione, non il sito. Il rilevamento è euristico:
  un'ispezione con un emittente sconosciuto e SCT presenti non verrebbe segnalata.
- La copia per la stampa riduce lo screenshot alla larghezza del foglio: con pagine larghe il
  testo può risultare piccolo; conviene catturare a 1024 px o usare l'A4 orizzontale.
- La strategia attuale estende l'altezza della finestra simulata per catturare l'intera
  pagina: elementi legati all'altezza del viewport (`100vh`) possono allungarsi e il layout
  può differire da quello della finestra iniziale.
- La modalità attuale basata su `debugger` rifiuta pagine interne del browser (`chrome://`,
  Chrome Web Store) e altri schemi non supportati. Non è implementata una modalità
  alternativa di sola cattura dell'area visibile tramite `captureVisibleTab`.
- Le acquisizioni contengono quello che la pagina mostrava, compresi eventuali dati personali se
  eri autenticato. Per le pagine pubbliche conviene catturare da una finestra in incognito o da
  un profilo Chrome dedicato. L'incognito non anonimizza l'operatore e non isola il
  sistema operativo; un profilo dedicato separa i dati di navigazione, ma non protegge
  da un host compromesso.

### Isolamento esterno e limiti accettati

Il progetto resta un'estensione autonoma, senza launcher nativo né dipendenze di
virtualizzazione. Può usare le API e l'isolamento forniti dal browser, ma non crea o
amministra una sandbox del sistema operativo o una macchina virtuale. Un collegamento
tramite Native Messaging richiederebbe un'applicazione esterna installata e registrata:
non sarebbe una funzione contenuta interamente nel plugin.

Windows Sandbox o una VM ripristinabile possono essere predisposte separatamente
secondo le regole dell'ufficio. Sono misure facoltative di riduzione del rischio, non
funzioni implementate o controllate dall'estensione. Anche con una VM restano necessarie
la fiducia nell'host e nell'hypervisor e la documentazione delle modalità di acquisizione.
Un ambiente isolato non certifica l'autenticità del sito e non elimina eventuali
intercettazioni TLS presenti lungo la connessione.

Si accetta quindi come rischio residuo l'assenza di isolamento e attestazione del sistema
operativo gestiti dal plugin. Il report non deve essere interpretato come una
certificazione dell'assenza di manomissioni. L'eventuale ambiente esterno usato va annotato
manualmente nelle note del caso; l'estensione non ne verifica autonomamente l'impiego.

Riferimenti: [Native Messaging di Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
[Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/),
[art. 41 del regolamento eIDAS](https://eur-lex.europa.eu/eli/reg/2014/910/2024-10-18).

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
| `management` (facoltativo) | Elencare le altre estensioni attive nel report; chiesto solo attivando l'opzione |
| Host facoltativi | Contattare il servizio di marca temporale scelto; chiesto solo per quel dominio |

## Privacy

L'estensione non raccoglie dati e non usa server propri. Se la marca temporale è attiva,
invia al servizio scelto **l’hash SHA-256** del manifest, mai i file né l’URL della pagina.
Se il contesto di rete esterno è attivo (disattivato di default), invia **il nome di dominio e
l'IP del server** a IANA, ai registri RDAP e al servizio DNS-over-HTTPS scelto; mai percorso,
parametri, contenuti o reperti.
Nelle Opzioni è presente un riquadro di supporto volontario con il nome utente pubblico
Satispay dell'autore, copiabile negli appunti. Non contiene referral, link promozionali
o richieste automatiche a Satispay e non misura contributi o clic.
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
lib/pdf.js         Generatore PDF (copertina + screenshot JPEG, copia A4 per la stampa)
lib/tsa.js         Richiesta e lettura marche temporali RFC 3161
lib/tsaverify.js   Verifica firma CMS e catena dei certificati della marca
lib/tsaroots.js    CA radice incluse per i servizi TSA preimpostati
lib/har.js         Registro HAR delle risorse di rete
lib/integrity.js   Impronta del codice ed elenco delle altre estensioni
lib/netcontext.js  Contesto di rete esterno: RDAP e DNS-over-HTTPS
lib/cookies.js     Cookie e storage con impronte dei valori
lib/reporthtml.js  Report di acquisizione in HTML
lib/eml.js         Bozza di messaggio per l'invio tramite PEC
docs/PROCEDURA.md  Procedura operativa di acquisizione
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
git tag v1.8.1
git push origin v1.8.1
```

## Licenza

[MIT](LICENSE) © 2026 Andrea Martin


### Test del browser

`npm ci --ignore-scripts`, `npx playwright install chromium` e `npm run test:browser` (su Linux senza display: `xvfb-run -a npm run test:browser`)
eseguono una prova dell'estensione in Chromium su un server HTTP locale: redirect,
richieste generate dallo scorrimento e download completati o interrotti. Le dipendenze
Node servono solo al collaudo e non vengono incluse nel pacchetto dell'estensione.

La release può essere pubblicata anche tramite una PR interna dal branch
`release/<versione>` verso `main`: aggiornare `manifest.json` e changelog,
attendere la CI e unire la PR. Il workflow verifica che la versione nel nome del
branch coincida con il manifest, crea il tag sul commit di merge e pubblica gli artefatti.

## Materiale per il Chrome Web Store

Testi italiano/inglese, motivazioni dei permessi e istruzioni per il revisore sono in
[docs/store](docs/store/README.md). La CI genera screenshot reali delle Opzioni a 1280×800.
Le release includono anche `store-submission-<versione>.zip`, con il pacchetto installabile
e il materiale da caricare separatamente nel pannello dello store. Il bundle esterno
non va caricato come estensione. La pubblicazione resta soggetta alla revisione Google.
