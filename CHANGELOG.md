# Changelog

Tutte le modifiche significative al progetto sono documentate in questo file.

## [2.0.0] - 2025-11-07

### Aggiunto
- **Gestione Visibilità Presidi Individuali**
  - Checkbox per ogni presidio nella sidebar
  - Mostra/nascondi presidi singolarmente
  - Default: tutti i presidi visibili

- **Persistenza Stato in Browser**
  - Salvataggio automatico in localStorage
  - Pulsante "💾 Salva" per persistere lo stato corrente
  - Pulsante "🔄 Reset" per ripristinare stato iniziale (tutti visibili)
  - Caricamento automatico dello stato salvato all'avvio

- **Funzione Stampa Mappa Avanzata**
  - Pulsante "🖨️ Stampa" nella sidebar
  - Formato A3 landscape ottimizzato
  - Etichette automatiche con nome presidio
  - Zoom automatico per includere tutti i presidi visibili
  - Esclusione sidebar e controlli dalla stampa
  - Ripristino automatico vista dopo stampa

- **Configurazione Claude Code**
  - `.claude/config.json`: Configurazione progetto
  - `.claude/project-context.md`: Documentazione completa
  - `.claude/commands/start.md`: Comando avvio server
  - `.claude/commands/geocode.md`: Comando geocodifica
  - `.claude/commands/add-presidio.md`: Comando aggiunta presidio
  - `.claude/commands/status.md`: Comando stato progetto

### Modificato
- README.md aggiornato con nuove funzionalità v2.0
- Sidebar riorganizzata con sezione dedicata "🏥 Gestione Presidi"
- CSS ottimizzato per stampa con regole @media print
- JavaScript refactoring per gestione stato presidi

### Tecnico
- Nuovo oggetto `presidiVisibility` per tracking stato
- Array `allPresidiMarkers` per gestione completa marker
- Dizionario `presidiLabels` per etichette stampa
- Funzioni `loadPresidiVisibility()`, `savePresidiVisibility()`, `resetPresidiVisibility()`
- Funzione `printMap()` con ottimizzazione automatica bounds
- Posizionamento dinamico etichette con `map.latLngToContainerPoint()`

## [1.0.0] - 2025-11-06

### Aggiunto
- Visualizzazione mappa interattiva con Leaflet.js
- 8 distretti sanitari con colori distintivi
- 112 comuni/circoscrizioni geolocalizzati
- ~94 presidi sanitari con marker 🏥
- Filtri checkbox per distretti
- Barra di ricerca comuni con zoom
- Hover e click per informazioni dettagliate
- Drag-and-drop editing coordinate presidi
- Salvataggio coordinate via API REST
- Geofencing automatico per assegnazione distretto/comune
- Statistiche geolocalizzazione real-time
- Server Node.js con API endpoints
- Generazione automatica GeoJSON da CSV
- Geocodifica indirizzi via Nominatim API
- Point-in-polygon algorithm (ray casting)
- Supporto reverse proxy con BASE_PATH dinamico

### File Iniziali
- `server.js`: Server HTTP con API
- `generate-presidi-from-csv.js`: Generazione veloce GeoJSON
- `process-presidi.js`: Geocodifica Nominatim
- `public/index.html`: Applicazione SPA completa
- `data/presidi.csv`: Database master presidi
- `data/distretti-comuni.csv`: Mappature
- GeoJSON boundaries distretti e comuni

### API
- `GET /api/stats`: Statistiche geolocalizzazione
- `POST /api/update-presidio`: Aggiornamento coordinate

---

## Template per Release Future

## [X.Y.Z] - YYYY-MM-DD

### Aggiunto
- Nuove funzionalità

### Modificato
- Modifiche a funzionalità esistenti

### Deprecato
- Funzionalità deprecate (ancora disponibili)

### Rimosso
- Funzionalità rimosse

### Corretto
- Bug fix

### Sicurezza
- Patch di sicurezza
