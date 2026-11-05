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
- **Pagina che cambia indirizzo**: URL e titolo nel report sono quelli effettivi al momento
  dello screenshot; se differiscono da quelli iniziali viene segnalato.
- **Dimensioni**: l'altezza catturata ha un limite configurabile, per evitare che una pagina
  infinita esaurisca la memoria.
- **HTML salvato**: il DOM viene codificato come testo inerte in un contenitore HTML controllato
  dall’estensione con CSP restrittiva. Nessuna parte del DOM viene interpretata come markup.
  Questa garanzia riguarda il sorgente HTML, non l’MHTML.
- **Dati sensibili nel report**: i valori dei cookie (`Set-Cookie`) e le password nell'URL
  vengono rimossi; caratteri di controllo e di direzione del testo vengono eliminati da nomi
  di file e report.
- **Marca temporale**: credenziali e header vengono inviati solo via `https`, senza redirect,
  senza cookie, con timeout e dimensione massima della risposta. Struttura DER, algoritmo, hash, nonce obbligatorio e policy della risposta
  vengono controllati. Firma e fiducia dei certificati NON sono verificate dall’estensione:
  lo stato è `not-verified` e la verifica va eseguita con OpenSSL (vedi README).
- **Integrità del pacchetto**: la marca riguarda un manifest di reperti e report immutabili.
  L’esito TSA resta in una ricevuta separata; il riepilogo finale include tutti gli altri file.
- **Nomi e comandi**: nomi tecnici con UUID, indipendenti dal titolo della pagina; quoting
  esplicito nei comandi di verifica.
- **Download**: esito positivo solo dopo lo stato `complete`; interruzioni, rimozioni,
  rinomina inattesa e timeout generano errore. Un errore può lasciare file parzialmente salvati.
- **Messaggi**: il service worker accetta comandi solo dal popup dell'estensione; non ci sono
  content script né risorse accessibili dalle pagine web.
- **Pagine dell'estensione**: Content-Security-Policy restrittiva (`script-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`); nessun contenuto inserito come HTML.

- **Credenziali della TSA**: password e valore dell'header non vengono mai scritti in chiaro
  su disco. Di default restano solo in memoria (`chrome.storage.session`) fino alla chiusura
  del browser; in alternativa vengono salvati cifrati con AES-256-GCM, con chiave derivata da
  una password di protezione (PBKDF2-SHA256, 600.000 iterazioni, salt casuale). La password
  di protezione non viene salvata. Le credenziali in chiaro delle versioni precedenti vengono
  spostate in memoria e cancellate dal disco all'aggiornamento.

## Rischi residui

- **Credenziali in memoria**: mentre il browser è aperto e le credenziali sono sbloccate,
  un malware con accesso al processo di Chrome può leggerle. Nessuna estensione può
  proteggersi da un computer compromesso.
- **Dati personali nelle acquisizioni**: le acquisizioni registrano fedelmente quello che la
  pagina mostrava; se eri autenticato, anche dati personali o token presenti nella pagina,
  nell'MHTML e nell'HTML. Rimuoverli automaticamente renderebbe la prova contestabile, quindi
  non viene fatto. Per catturare pagine pubbliche usa una finestra in incognito (abilita
  l'estensione con *Consenti in modalità di navigazione in incognito*) o un profilo Chrome
  dedicato senza account collegati, e valuta cosa condividi.
- **Permesso `debugger`**: è necessario per la cattura completa, i dati di rete e l'MHTML, e
  Chrome non permette di renderlo facoltativo. L'estensione lo usa solo sulla scheda attiva e
  solo durante una cattura avviata da te. Il rischio principale è un aggiornamento manomesso:
  per questo il progetto non ha dipendenze né codice caricato da remoto, le pagine hanno una
  CSP restrittiva e le release sono create da GitHub Actions a partire dai tag, con l'hash
  SHA-256 del pacchetto pubblicato accanto.

