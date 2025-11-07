---
description: Mostra lo stato corrente del progetto
---

Visualizza informazioni sullo stato del progetto:

1. Verifica se il server è in esecuzione
2. Leggi statistiche da data/presidi.csv:
   - Numero totale presidi
   - Presidi geocodificati (con coordinate)
   - Presidi da geocodificare (senza coordinate)
   - Percentuale completamento

3. Verifica integrità file:
   - ✓ data/presidi.csv esiste
   - ✓ public/presidi.geojson esiste e aggiornato
   - ✓ public/distretti-detailed.geojson esiste

4. Mostra ultimi 3 commit git (se repository git)

5. Suggerisci prossime azioni basate sullo stato
