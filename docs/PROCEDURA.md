# Procedura operativa di acquisizione

Procedura consigliata per acquisire una pagina web con Forensic Web Capture in modo
ripetibile e documentato. Fa riferimento ai principi di ISO/IEC 27037 (identificazione,
raccolta, acquisizione e conservazione delle prove digitali). Adattala alle regole del tuo
ufficio e al procedimento.

> Lo strumento documenta ciò che il browser ha ricevuto e mostrato. Non sostituisce la
> valutazione di un consulente tecnico né garantisce da solo l'ammissibilità in giudizio.
> L'integrità di host e browser è un'assunzione operativa: il plugin non la attesta
> indipendentemente e non include un ambiente sandbox o una VM.

## 1. Preparazione (una volta)

1. Crea un **profilo del browser dedicato** alle acquisizioni, senza altre estensioni e senza
   account personali collegati. Il profilo separa i dati di navigazione, non isola il
   sistema operativo. Se previsto dalle regole dell'ufficio, predisponi separatamente
   una sandbox o VM e documentane configurazione e ripristino; il plugin non la avvia
   e non ne verifica l'impiego.
2. Installa l'estensione dalla [release ufficiale](../../../releases) e confronta l'impronta
   del codice: il file `code-fingerprint-<versione>.txt` della release deve coincidere con la
   riga *Impronta del codice* dei report.
3. Nelle Impostazioni:
   - **Catena di custodia**: inserisci operatore e organizzazione; attiva *Rendi obbligatori
     operatore e riferimento del caso* e *Elenca le altre estensioni attive*.
   - **Marca temporale**: scegli il servizio in base alle garanzie richieste. Una validazione
     qualificata eIDAS beneficia delle presunzioni dell'art. 41; una non qualificata non è
     esclusa dalla prova per questo solo motivo. Verifica il servizio e il contratto;
     il preset non ne attesta la qualificazione. Premi *Prova il servizio*.
   - **Avanzate**: lascia attivo il controllo dell'intercettazione TLS.
4. Sincronizza l'orologio di sistema (Windows: Impostazioni > Ora e lingua > Sincronizza ora).

## 2. Prima di ogni acquisizione

1. Verifica l'eventuale **ispezione HTTPS** di antivirus, proxy o VPN mantenendo le
   protezioni richieste dall'ufficio. Se occorre una connessione senza ispezione, usa un
   ambiente autorizzato e configurato allo scopo. Documenta proxy, VPN e ispezione noti:
   gli IP dei server osservati nel report non attestano l'IP pubblico di uscita dell'operatore.
2. Apri la pagina **partendo da un punto documentabile** (motore di ricerca, link ricevuto,
   indirizzo digitato). Se serve mostrare il percorso, attiva *Includi la cronologia della scheda*.
3. Se la pagina richiede l'accesso, annota quale account è stato usato nelle note.

## 3. Acquisizione

1. Apri il popup e compila **Dati del caso**: riferimento del caso e motivo/note.
2. Attiva almeno: *Pagina di copertina*, *Salva pagina completa (MHTML)*, *Salva sorgente HTML*,
   *Dati di rete e certificato*, *Registro HAR*, *Marca temporale*, *Report anche in JSON*,
   *Tutto in un unico ZIP*. Se servirà una copia cartacea, *Copia PDF per la stampa*.
3. Premi **Cattura pagina intera** e non interagire con la scheda fino al termine.
4. Se compare l'avviso di **connessione ispezionata**, valuta un ambiente autorizzato
   privo di ispezione e premi *Ricontrolla* dopo l'eventuale cambio di configurazione.
   Se procedi con *Acquisisci comunque*, annota il motivo e i limiti del certificato osservato.
5. Controlla nel popup: hash del file principale, ora della TSA, esito della verifica della
   marca ed eventuali avvisi (estensioni, troncamento, orologio). `verified` riguarda firma
   e catena: non comprende controllo della revoca o qualificazione eIDAS del servizio.

## 4. Verifica e conservazione

1. Verifica subito il pacchetto (dentro lo ZIP estratto):
   ```sh
   sha256sum -c SHA256SUMS.txt
   sha256sum -c "<id>.manifest.sha256"
   openssl ts -verify -data "<id>.manifest.sha256" -in "<id>.tsr" -CAfile <CA della TSA> -untrusted <certificato TSA>
   ```
2. Annota l'SHA-256 dello ZIP (mostrato nel popup) nel verbale o nel registro del caso.
3. Copia lo ZIP **inalterato** su almeno due supporti, di cui uno non riscrivibile o in un
   archivio con controllo degli accessi; registra ogni trasferimento (chi, quando, dove).
4. Non aprire l'MHTML fuori da un ambiente isolato: è una copia attiva della pagina.

## 5. Cosa riportare nel verbale

- Riferimento del caso, operatore, data e ora (UTC e locale) dell'acquisizione.
- URL acquisito e, se pertinente, come ci si è arrivati.
- Versione dell'estensione e impronta del codice.
- Ambiente usato (profilo dedicato, sandbox o VM), versioni e configurazione note;
  eventuale identificativo dell'immagine e ripristino eseguito, se disponibili.
  Queste annotazioni sono dichiarazioni dell'operatore, non attestazioni del plugin.
- SHA-256 dello ZIP e del file principale; servizio TSA, ora certificata, esito della verifica.
- Avvisi mostrati e scelte fatte (es. *Acquisisci comunque*), con motivazione.
- Limiti noti (capitolo *Limiti e valore probatorio* del README).
