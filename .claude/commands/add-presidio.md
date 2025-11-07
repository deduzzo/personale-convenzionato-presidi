---
description: Aggiungi un nuovo presidio al sistema
---

Aggiungi un nuovo presidio sanitario al sistema:

1. Chiedi all'utente:
   - Nome struttura
   - Indirizzo completo
   - (Opzionale) Coordinate lat/lon se già note

2. Aggiungi la nuova riga a data/presidi.csv

3. Se le coordinate non sono fornite:
   - Spiega che va eseguito il geocoding con `/geocode`
   - Oppure offri di geocodificare subito solo questo presidio

4. Se le coordinate sono fornite:
   - Esegui point-in-polygon per assegnare distretto/comune
   - Aggiorna il CSV con tutti i dati

5. Rigenera presidi.geojson

6. Se il server è in esecuzione, riavvialo per applicare le modifiche
