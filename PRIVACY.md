# Informativa sulla privacy

*Ultimo aggiornamento: 5 novembre 2026*

Forensic Web Capture è un'estensione per Google Chrome sviluppata da Andrea Martin.

## Dati raccolti

L'estensione **non raccoglie, non trasmette e non vende** dati personali. Non usa analytics,
cookie di tracciamento o server propri.

## Dati elaborati sul tuo dispositivo

Quando avvii una cattura, l'estensione legge la pagina della scheda attiva (aspetto, contenuto,
URL, titolo e, se attivi la funzione *Dati di rete*, la risposta HTTP e il certificato del sito).
Questi dati servono solo a creare i file di acquisizione, che vengono salvati nella cartella
Download del tuo computer e non vengono inviati altrove.

## Impostazioni

Le impostazioni sono salvate nella memoria locale dell'estensione (`chrome.storage.local`) su
questo browser. Le credenziali del servizio di marca temporale non vengono mai salvate in chiaro:
restano in memoria fino alla chiusura del browser oppure, se lo scegli, vengono salvate cifrate
con una password di protezione che non viene memorizzata. Nulla viene sincronizzato o inviato
all'autore.

## Servizi esterni

Solo se attivi la **marca temporale RFC 3161**, l'estensione invia al servizio da te configurato
(TSA) una richiesta che contiene **l'hash SHA-256** del manifest di acquisizione (reperti e report) e un numero casuale (nonce),
insieme alle credenziali che hai inserito. Non vengono inviati il file, l'URL o il contenuto della
pagina. Il trattamento di questa richiesta è regolato dall'informativa del servizio scelto.

## Contatti

Per domande apri una segnalazione nella sezione *Issues* del repository del progetto.

