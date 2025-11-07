---
description: Avvia il server dell'applicazione
---

Avvia il server Node.js per l'applicazione Presidi ASP Messina:

1. Controlla se il server è già in esecuzione
2. Se in esecuzione, fermalo
3. Avvia il server con `node server.js` in background
4. Verifica che sia partito correttamente
5. Mostra l'URL per accedere all'applicazione

Il server:
- Genera automaticamente presidi.geojson da presidi.csv all'avvio
- Verifica che tutti i presidi abbiano distretto/comune assegnati
- Serve l'applicazione su http://localhost:3000
