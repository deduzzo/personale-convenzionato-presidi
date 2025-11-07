---
description: Geocodifica i presidi senza coordinate
---

Esegui il processo di geocodifica per i presidi che non hanno ancora coordinate:

1. Leggi il file data/presidi.csv
2. Identifica i presidi senza latitudine/longitudine
3. Per ogni presidio:
   - Usa l'API Nominatim per geocodificare l'indirizzo
   - Applica rate limiting (1 richiesta/secondo)
   - Esegui point-in-polygon per assegnare distretto/comune
   - Aggiorna il CSV con le nuove coordinate
4. Mostra un report dei presidi geocodificati

ATTENZIONE:
- Il processo può richiedere tempo (1 secondo per presidio)
- Usa l'API pubblica Nominatim (max 1 req/s)
- Salva automaticamente i progressi nel CSV

Comando: `node process-presidi.js`