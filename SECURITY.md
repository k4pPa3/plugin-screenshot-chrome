# Sicurezza

## Segnalare una vulnerabilità

Non aprire una *issue* pubblica per le vulnerabilità. Usa invece la funzione
**Report a vulnerability** nella scheda *Security* del repository (segnalazione privata
di GitHub). Indica la versione dell'estensione, i passi per riprodurre il problema e
l'impatto che hai osservato.

Ricevuta la segnalazione, verrà confermata e, se valida, corretta in una nuova versione
con una nota nel [CHANGELOG](CHANGELOG.md).

## Versioni supportate

Viene corretta solo l'ultima versione pubblicata.

## Modello di sicurezza

L'estensione tratta come **non affidabili** la pagina catturata, il server che la
fornisce e il servizio di marca temporale. In particolare:

- **Mondo isolato**: il codice che scorre la pagina e ne legge l'HTML gira in un contesto
  JavaScript separato, che la pagina non può alterare (es. ridefinendo `outerHTML` o
  `setTimeout`). Ogni valutazione ha un tempo massimo.
- **Navigazione durante la cattura**: dopo l’eventuale ricarica iniziale, un cambio del
  documento principale o una navigazione nella pagina rilevata dal debugger interrompe
  l’acquisizione. I formati vengono prodotti in sequenza e il DOM può cambiare anche
  senza navigazione.
- **Dimensioni**: limite di 40 milioni di pixel per lo screenshot e 96 MiB per l’export.
  HTML e MHTML oltre 24 MiB vengono omessi con un avviso se restano altri file. Chrome
  restituisce l’MHTML in un’unica risposta CDP: il limite si applica dopo la ricezione.
- **HTML salvato**: il DOM viene codificato come testo inerte in un contenitore HTML controllato
  dall’estensione con CSP restrittiva. Nessuna parte del DOM viene interpretata come markup.
  Questa garanzia riguarda il sorgente HTML, non l’MHTML.
- **Dati sensibili nel report**: i valori dei cookie (`Set-Cookie`) e le password nell'URL
  vengono rimossi; caratteri di controllo e di direzione del testo vengono eliminati da nomi
  di file e report.
- **Report HTML**: pagina generata dall'estensione con CSP `default-src 'none'`, senza script
  né risorse esterne; ogni valore (anche titolo e testi della pagina) passa da un escape HTML.
- **Cookie e storage**: di default si salvano solo SHA-256 e lunghezza dei valori; i valori
  restano in memoria solo fino al calcolo delle impronte. I valori in chiaro richiedono
  un'opzione esplicita nelle Impostazioni e producono un avviso.
- **Contesto di rete esterno**: disattivato di default; richieste GET via `https` (i servizi
  non https del bootstrap IANA vengono scartati), senza cookie né referrer, con timeout e
  dimensione massima. Viene inviato solo il nome host o l'IP, mai percorso o parametri.
  Le risposte RDAP e DNS sono trattate come dati non affidabili: salvate come JSON e mostrate
  nei report solo come testo.
- **Bozza PEC**: il destinatario finisce nell'intestazione solo se è un indirizzo semplice e
  valido (niente a capo, virgole o nomi visualizzati), l'oggetto è codificato RFC 2047.
- **Marca temporale**: credenziali e header vengono inviati solo via `https`, senza redirect,
  senza cookie, con timeout e dimensione massima della risposta. Struttura DER, algoritmo, hash, nonce obbligatorio e policy della risposta
  vengono controllati. La firma CMS (impronta, `signingCertificate`, firma) e la catena dei
  certificati fino a una radice inclusa o aggiunta dall’utente vengono verificate; l’esito è
  `verified`, `untrusted`, `invalid` o `unsupported`. La revoca (CRL/OCSP) NON è controllata.
  Radici incluse in `lib/tsaroots.js`, con impronta SHA-256; vanno aggiornate quando cambiano.
- **Intercettazione TLS**: un software locale che ispeziona HTTPS sostituisce il certificato
  del sito. Con i dati di rete attivi la cattura si sospende se il certificato non ha SCT di
  Certificate Transparency o proviene da un emittente di ispezione noto; procedendo comunque
  l'esito e la scelta dell'utente sono registrati. Il rilevamento è euristico, non una
  verifica del certificato contro fonti esterne.
- **Integrità dell'ambiente**: il report riporta l'impronta SHA-256 del codice dell'estensione
  (confrontabile con `code-fingerprint-<versione>.txt` della release) e, con il permesso
  facoltativo `management`, le altre estensioni attive, segnalando quelle che possono leggere o
  modificare le pagine. Il permesso è chiesto solo attivando l'opzione e serve solo a leggere
  l'elenco.
- **HAR**: gli header `Cookie`, `Set-Cookie`, `Authorization` e `Proxy-Authorization` sono
  oscurati; i contenuti delle risposte sono incorporati entro 10 MB ciascuno e 50 MB in tutto,
  oltre restano solo le impronte.
- **Integrità del pacchetto**: la marca riguarda un manifest di reperti e report immutabili.
  L’esito TSA resta in una ricevuta separata; il riepilogo finale include tutti gli altri file.
- **Nomi e comandi**: nomi tecnici con UUID, indipendenti dal titolo della pagina; quoting
  esplicito nei comandi di verifica.
- **Download**: esito positivo solo dopo lo stato `complete`; interruzioni, rimozioni,
  rinomina inattesa e timeout generano errore. Un errore può lasciare file parzialmente salvati.
- **Messaggi**: il service worker accetta comandi solo dal popup dell'azione (stessa
  estensione, percorso esatto, nessuna scheda associata); non ci sono content script né
  risorse accessibili dalle pagine web.
- **Pagine catturabili**: solo `http:`, `https:` e `file:`; pagine interne, `view-source:`,
  `data:`, `blob:` e schemi di altri browser vengono rifiutati.
- **Header della TSA**: il nome deve essere un token HTTP valido e non può sovrascrivere
  header riservati come `Host`, `Content-Type`, `Authorization` o `Cookie`. Se l'URL punta
  a una rete locale o privata (es. `localhost`, `192.168.x.x`, `169.254.x.x`) le opzioni
  mostrano un avviso.
- **Pagine dell'estensione**: Content-Security-Policy restrittiva (`script-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`); nessun contenuto inserito come HTML.

- **Credenziali della TSA**: password e valore dell'header non vengono mai scritti in chiaro
  su disco. Di default restano solo in memoria (`chrome.storage.session`) fino alla chiusura
  del browser; in alternativa vengono salvati cifrati con AES-256-GCM, con chiave derivata da
  una password di protezione (PBKDF2-SHA256, 600.000 iterazioni, salt casuale). La password
  di protezione non viene salvata. Le credenziali in chiaro delle versioni precedenti vengono
  spostate in memoria e cancellate dal disco all'aggiornamento.

## Rischi residui

- **Isolamento del sistema operativo non incluso**: il plugin non avvia o gestisce
  Windows Sandbox, VM o profili del sistema operativo. Il mondo JavaScript isolato e le
  protezioni del browser non costituiscono un ambiente operativo indipendente dall'host.
  Questo limite è accettato nel perimetro dell'estensione autonoma; un eventuale ambiente
  esterno resta una misura separata, predisposta e documentata dall'operatore.
- **Nessuna attestazione indipendente**: impronta del codice ed elenco delle estensioni
  sono raccolti all'interno del browser. Un host o browser compromesso può falsificare
  anche questi risultati. Una VM riduce alcuni rischi ma non certifica l'integrità
  dell'host o dell'hypervisor; la marca temporale non elimina questa dipendenza.
- **Portata della verifica TSA**: `verified` non include controllo della revoca né
  qualificazione del servizio mediante liste fiduciarie eIDAS. Il preset del servizio
  è un'indicazione di configurazione, non un'attestazione della sua qualificazione.

- **Cookie e storage**: l'impronta SHA-256 non protegge valori brevi o prevedibili, che si
  possono ricavare per tentativi. Con i valori in chiaro il pacchetto contiene credenziali.
- **Servizi del contesto di rete**: IANA, i registri e il servizio DNS scelto vedono il dominio
  e l'IP indagati e l'IP della connessione dell'operatore. I loro dati possono essere
  incompleti (registranti oscurati per GDPR) o diversi da quelli visti dal PC (DNS geografico).
- **Credenziali in memoria**: mentre il browser è aperto e le credenziali sono sbloccate,
  un malware con accesso al processo di Chrome può leggerle. Nessuna estensione può
  proteggersi da un computer compromesso.
- **Dati personali nelle acquisizioni**: le acquisizioni registrano fedelmente quello che la
  pagina mostrava; se eri autenticato, anche dati personali o token presenti nella pagina,
  nell'MHTML e nell'HTML. Rimuoverli automaticamente renderebbe la prova contestabile, quindi
  non viene fatto. Per catturare pagine pubbliche usa una finestra in incognito (abilita
  l'estensione con *Consenti in modalità di navigazione in incognito*) o un profilo Chrome
  dedicato senza account collegati, e valuta cosa condividi. Incognito e profilo dedicato
  non forniscono isolamento del sistema operativo né anonimato di rete.
- **Permesso `debugger`**: è necessario per la cattura completa, i dati di rete e l'MHTML, e
  Chrome non permette di renderlo facoltativo. L'estensione lo usa solo sulla scheda attiva e
  solo durante una cattura avviata da te. Il rischio principale è un aggiornamento manomesso:
  per questo il progetto non ha dipendenze né codice caricato da remoto, le pagine hanno una
  CSP restrittiva e le release sono create da GitHub Actions a partire dai tag, con l'hash
  SHA-256 del pacchetto pubblicato accanto.
