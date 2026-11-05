# Informativa sulla privacy

*Ultimo aggiornamento: 5 novembre 2026*

Forensic Web Capture è un'estensione per Google Chrome sviluppata da Andrea Martin.

## Dati raccolti

L'estensione **tratta dati sul dispositivo dell'utente** per creare le acquisizioni.
L'autore non riceve le acquisizioni e non usa analytics, cookie di tracciamento o server
propri. Non vende i dati trattati. L'elaborazione locale può includere dati personali
e sensibili presenti nelle pagine o inseriti dall'operatore, come descritto di seguito.

## Dati elaborati sul tuo dispositivo

Quando avvii una cattura, l'estensione legge la pagina della scheda attiva (aspetto, contenuto,
URL, titolo e, se attivi la funzione *Dati di rete*, la risposta HTTP e il certificato del sito).
Questi dati servono solo a creare i file di acquisizione, che vengono salvati nella cartella
Download del tuo computer e non vengono inviati all'autore. Il contenuto del sito può
comprendere comunicazioni, informazioni sanitarie o finanziarie e dati di autenticazione,
a seconda della pagina scelta. Le intestazioni HAR di autorizzazione e cookie sono
oscurate, ma il contenuto di screenshot, HTML, MHTML e risposte può comunque includere
dati sensibili o token: non viene effettuata una bonifica generale delle acquisizioni.

Con il **registro HAR** l'acquisizione contiene anche le risorse caricate dalla pagina (con
cookie e header di autorizzazione oscurati). Se attivi le relative opzioni, il report include
le ultime pagine aperte nella scheda e l'elenco delle altre estensioni installate: per
quest'ultimo l'estensione chiede il permesso facoltativo di gestione delle estensioni, usato
solo per leggerne nome, versione e permessi. I dati della catena di custodia (operatore,
organizzazione, caso, note) che inserisci restano nelle impostazioni locali e nei report.

## Impostazioni

Le impostazioni sono salvate nella memoria locale dell'estensione (`chrome.storage.local`) su
questo browser. Le credenziali del servizio di marca temporale non vengono mai salvate in chiaro:
restano in memoria fino alla chiusura del browser oppure, se lo scegli, vengono salvate cifrate
con una password di protezione che non viene memorizzata. Nulla viene sincronizzato o inviato
all'autore.

## Servizi esterni

Se attivi la **marca temporale RFC 3161**, l'estensione invia al servizio da te configurato
(TSA) una richiesta che contiene **l'hash SHA-256** del manifest di acquisizione (reperti e report) e un numero casuale (nonce),
insieme alle credenziali che hai inserito. Non vengono inviati il file, l'URL o il contenuto della
pagina. Come per qualsiasi connessione al servizio, il fornitore TSA può osservare
l'indirizzo IP e i metadati tecnici della richiesta. L'invio può avvenire via HTTP solo
per servizi senza credenziali; l'estensione rifiuta l'invio di credenziali via HTTP.
Per il servizio scelto preferire un endpoint HTTPS. Il trattamento di questa richiesta è regolato dall'informativa del servizio scelto.

## Supporto volontario Satispay

Le Opzioni mostrano il nome utente pubblico Satispay dell'autore per un contributo
facoltativo, anche di 1 € o di importo libero. Il pulsante di copia scrive negli appunti
solo il nome utente mostrato. Il riquadro non contiene referral o link promozionali,
non carica risorse esterne e non misura visualizzazioni, clic o pagamenti. Il programma
non avvia trasferimenti e non riceve informazioni sui contributi. L'eventuale pagamento
avviene separatamente nell'app Satispay secondo le sue condizioni e la sua informativa.

## Contatti

Per domande apri una segnalazione nella sezione *Issues* del repository del progetto.
