# Procedura operativa di acquisizione

Procedura consigliata per acquisire una pagina web con Forensic Web Capture in modo
ripetibile e documentato. Fa riferimento ai principi di ISO/IEC 27037 (identificazione,
raccolta, acquisizione e conservazione delle prove digitali). Adattala alle regole del tuo
ufficio e al procedimento.

> Lo strumento documenta ciò che il browser ha ricevuto e mostrato. Non sostituisce la
> valutazione di un consulente tecnico né garantisce da solo l'ammissibilità in giudizio.

## 1. Preparazione (una volta)

1. Crea un **profilo del browser dedicato** alle acquisizioni, senza altre estensioni e senza
   account personali collegati.
2. Installa l'estensione dalla [release ufficiale](../../../releases) e confronta l'impronta
   del codice: il file `code-fingerprint-<versione>.txt` della release deve coincidere con la
   riga *Impronta del codice* dei report.
3. Nelle Impostazioni:
   - **Catena di custodia**: inserisci operatore e organizzazione; attiva *Rendi obbligatori
     operatore e riferimento del caso* e *Elenca le altre estensioni attive*.
   - **Marca temporale**: per valore legale nell'UE usa un servizio **qualificato eIDAS**
     (es. Aruba, preimpostato), con le credenziali del contratto. Premi *Prova il servizio*.
   - **Avanzate**: lascia attivo il controllo dell'intercettazione TLS.
4. Sincronizza l'orologio di sistema (Windows: Impostazioni > Ora e lingua > Sincronizza ora).

## 2. Prima di ogni acquisizione

1. Disattiva la **protezione web / ispezione HTTPS** di antivirus o VPN (la VPN può restare
   attiva, ma il report indicherà come IP di uscita quello della VPN).
2. Apri la pagina **partendo da un punto documentabile** (motore di ricerca, link ricevuto,
   indirizzo digitato). Se serve mostrare il percorso, attiva *Includi la cronologia della scheda*.
3. Se la pagina richiede l'accesso, annota quale account è stato usato nelle note.

## 3. Acquisizione

1. Apri il popup e compila **Dati del caso**: riferimento del caso e motivo/note.
2. Attiva almeno: *Pagina di copertina*, *Salva pagina completa (MHTML)*, *Salva sorgente HTML*,
   *Dati di rete e certificato*, *Registro HAR*, *Marca temporale*, *Report anche in JSON*,
   *Tutto in un unico ZIP*. Se servirà una copia cartacea, *Copia PDF per la stampa*.
3. Premi **Cattura pagina intera** e non interagire con la scheda fino al termine.
4. Se compare l'avviso di **connessione ispezionata**, disattiva la protezione e premi
   *Ricontrolla*. Usa *Acquisisci comunque* solo se non è possibile, annotandone il motivo.
5. Controlla nel popup: hash del file principale, ora della TSA, esito della verifica della
   marca (`verified`) ed eventuali avvisi (estensioni, troncamento, orologio).

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
- SHA-256 dello ZIP e del file principale; servizio TSA, ora certificata, esito della verifica.
- Avvisi mostrati e scelte fatte (es. *Acquisisci comunque*), con motivazione.
- Limiti noti (capitolo *Limiti e valore probatorio* del README).
