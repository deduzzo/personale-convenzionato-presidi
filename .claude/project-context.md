# Presidi e Distretti Sanitari ASP Messina

## Panoramica Progetto

Applicazione web per la gestione e visualizzazione interattiva dei presidi sanitari e distretti dell'ASP 5 Messina.

## Architettura

### Stack Tecnologico
- **Backend**: Node.js (HTTP server nativo, no framework)
- **Frontend**: Vanilla JavaScript + HTML5 + CSS3
- **Map Library**: Leaflet.js 1.9.4
- **Tile Provider**: OpenStreetMap (gratuito)
- **Geocoding**: Nominatim API (OSM)
- **Data Format**: GeoJSON + CSV

### Struttura File

```
personale-convenzionato-presidi/
├── server.js                        # Server HTTP + API endpoints
├── generate-presidi-from-csv.js    # CSV → GeoJSON (veloce)
├── process-presidi.js              # Geocoding via Nominatim (lento)
├── data/
│   ├── presidi.csv                 # Database master presidi
│   ├── distretti-comuni.csv        # Mappatura distretti-comuni
│   ├── limits_P_83_municipalities.geojson
│   └── Circoscrizioni 2021.geojson
└── public/
    ├── index.html                  # Applicazione SPA (1400+ righe)
    ├── presidi.geojson             # Auto-generato all'avvio
    ├── distretti.geojson           # Aggregazione distretti
    └── distretti-detailed.geojson  # Comuni + circoscrizioni
```

## Funzionalità Principali

### 1. Visualizzazione Mappa Interattiva
- **8 distretti** con colori distinti
- **112 comuni** + 6 circoscrizioni Messina
- **~94 presidi sanitari** (marker 🏥)
- Hover per info, click per dettagli
- Zoom automatico su comune/distretto

### 2. Gestione Visibilità Presidi (NUOVO v2.0)
- ✅ Checkbox per mostrare/nascondere ogni presidio
- ✅ Salvataggio stato in localStorage browser
- ✅ Pulsante "Salva" per persistere preferenze
- ✅ Pulsante "Reset" per ripristinare stato iniziale
- ✅ Default: tutti i presidi visibili

### 3. Funzione Stampa Avanzata (NUOVO v2.0)
- ✅ Stampa in formato A3 landscape
- ✅ Ottimizzazione zoom automatica per presidi visibili
- ✅ Etichette con nome presidio visualizzate in stampa
- ✅ Nascondi sidebar e controlli in stampa
- ✅ Ripristino vista dopo stampa

### 4. Ricerca e Navigazione
- Barra di ricerca comuni in tempo reale
- Click su comune per zoom + highlight temporaneo
- Lista distretti/comuni espandibile
- Contatori presidi per distretto/comune

### 5. Editing Coordinate Presidi
- Right-click su marker → "Modifica posizione"
- Drag & drop per spostare presidio
- Salvataggio via API POST `/api/update-presidio`
- Aggiornamento automatico CSV e GeoJSON

## Workflow Dati

### Avvio Server
```
1. Check presidi.csv → trova missing distretto/comune
2. Geofencing automatico (point-in-polygon)
3. Update CSV con distretti assegnati
4. Genera presidi.geojson
5. Server ready → http://localhost:3000
```

### Aggiunta Nuovo Presidio
```
1. Aggiungi riga a data/presidi.csv
   Nome struttura, Indirizzo, Latitudine, Longitudine, Distretto, Comune

2a. Se hai coordinate:
    - Distretto/Comune auto-assegnati all'avvio server

2b. Se NO coordinate:
    - Esegui: node process-presidi.js
    - Nominatim geocode indirizzo → lat/lon
    - Point-in-polygon → distretto/comune
    - Update CSV

3. Restart server → rigenera presidi.geojson
```

## API Endpoints

### GET `/api/stats`
**Response:**
```json
{
  "total": 94,
  "geocoded": 89,
  "missing": 5,
  "percentage": 95
}
```

### POST `/api/update-presidio`
**Request:**
```json
{
  "nome": "Presidio Name",
  "lat": 38.1234,
  "lon": 15.5678
}
```

**Response:**
```json
{
  "success": true
}
```

## Algoritmi Chiave

### Point-in-Polygon (Ray Casting)
```javascript
function pointInPolygon(point, polygon) {
    // Supporta Polygon e MultiPolygon
    // Ray casting: conta intersezioni raggio orizzontale
    // Return: true se punto dentro poligono
}
```

### Geofencing Automatico
```javascript
function findContainingFeature(lat, lon, features) {
    // Itera su tutti i feature distretti-detailed.geojson
    // Esegue pointInPolygon per trovare distretto/comune
    // Return: { distretto, comune }
}
```

## Storage & Persistenza

### localStorage Keys
- `presidi-visibility`: Stato visibilità presidi
  ```json
  {
    "Presidio Name 1": true,
    "Presidio Name 2": false,
    ...
  }
  ```

### File Persistence
- **presidi.csv**: Database master (edit manuale o API)
- **presidi.geojson**: Auto-generato (non editare direttamente)

## Configurazione Deployment

### Reverse Proxy Support
L'app supporta deployment con base path personalizzato:

```javascript
// Carica config da API se su ws1.asp.messina.it
if (hostname === 'ws1.asp.messina.it') {
    fetch('https://ws1.asp.messina.it/api/v1/apps/presidi-distretti-asp-messina/config')
        .then(config => BASE_PATH = config.data.basePath)
}
```

## Comandi Utili

### Sviluppo
```bash
node server.js              # Avvia server (port 3000)
node process-presidi.js     # Geocodifica presidi missing
node generate-presidi-from-csv.js  # Rigenera solo GeoJSON
```

### Debug
```bash
# Controlla presidi senza coordinate
node -e "const csv = require('csv-parse/sync'); const fs = require('fs'); const data = csv.parse(fs.readFileSync('data/presidi.csv'), {columns: true}); console.log(data.filter(r => !r.Latitudine));"
```

## Note Tecniche

### Leaflet Layer Management
```javascript
distrettiLayers[distretto] = {
    layers: [],        // Array di L.geoJSON
    color: '#667eea',  // Colore assegnato
    visible: true      // Toggle visibilità
}
```

### Marker Storage
```javascript
allPresidiMarkers = [
    {
        id: 0,
        marker: L.marker(...),
        nome: "Presidio Name",
        distretto: "Messina",
        comune: "Villafranca",
        lat: 38.xx,
        lon: 15.xx
    },
    ...
]
```

### Print Labels Positioning
```javascript
// Converti lat/lon → pixel coordinates
const point = map.latLngToContainerPoint([lat, lon]);
label.style.left = point.x + 'px';
label.style.top = point.y + 'px';
```

## Vincoli e Limitazioni

### Nominatim API
- **Rate limit**: 1 richiesta/secondo
- **User-Agent**: Obbligatorio
- **Timeout**: 10 secondi per richiesta
- **No bulk**: Geocodifica sequenziale

### Browser Storage
- localStorage: ~5-10MB limite (sufficiente per 100+ presidi)
- Dati persistono fino a cancellazione manuale

### Stampa
- Formato: A3 landscape (42 × 29.7 cm)
- Risoluzione: Dipende da browser/OS
- Etichette: Posizionate con coordinate pixel (potrebbero slittare su browser diversi)

## TODO Future Enhancements

- [ ] Export PDF mappa con presidi
- [ ] Filtraggio presidi per distretto
- [ ] Statistiche presidi per tipo
- [ ] Import CSV bulk
- [ ] Backup automatico localStorage
- [ ] Offline support (Service Worker)
- [ ] Mobile app (PWA)

## Crediti

**Autore**: Ing. Roberto De Domenico
**Cliente**: ASP 5 Messina
**Versione**: 2.0.0
**Data**: Novembre 2025
