# Presidi e Distretti Sanitari ASP Messina

Mappa interattiva dei distretti sanitari, comuni e presidi sanitari dell'ASP 5 Messina.

## Descrizione

Applicazione web che visualizza su mappa interattiva:
- 8 distretti sanitari dell'ASP Messina
- 112 comuni/circoscrizioni (incluse le 6 circoscrizioni di Messina città)
- Presidi sanitari geolocalizzati con sistema di editing drag-and-drop

## Funzionalità

### Mappa Interattiva
- Visualizzazione distretti con colori distintivi
- Hover su comuni per vedere dettagli
- Click su distretti per visualizzare informazioni
- Filtri checkbox per mostrare/nascondere distretti
- Barra di ricerca comuni con zoom automatico

### Gestione Presidi
- Visualizzazione presidi sanitari con icona ospedale 🏥
- Conteggio presidi per distretto e comune
- Drag-and-drop per modificare posizioni
- Salvataggio coordinate in CSV tramite right-click
- Auto-completamento distretto/comune via geofencing

### Sidebar
- Legenda interattiva con filtri
- Lista distretti e comuni
- Comuni cliccabili per zoom sulla mappa
- Badge con numero presidi per comune

### Statistiche
- Stato geolocalizzazione in tempo reale
- Percentuale presidi geolocalizzati
- Numero presidi mancanti evidenziato

## Requisiti

- Node.js (v14 o superiore)
- Browser moderno con supporto ES6

## Installazione

1. Clona il repository o scarica i file
2. Assicurati di avere Node.js installato
3. Non sono necessarie dipendenze esterne npm

## Utilizzo

### Avvio Server

```bash
node server.js
```

Il server si avvierà su **http://localhost:3000**

All'avvio, il server:
1. Verifica presidi con coordinate ma senza distretto/comune
2. Completa automaticamente i dati mancanti via geofencing
3. Genera `presidi.geojson` dal CSV
4. Mostra statistiche di elaborazione

### Fermare Server

Premi `Ctrl+C` nel terminale

### Geocodifica Nuovi Indirizzi

Per geocodificare indirizzi nel CSV senza coordinate:

```bash
node process-presidi.js
```

Questo script:
- Legge indirizzi dal CSV
- Usa Nominatim API per geocodificare
- Rispetta rate limit (1 req/sec)
- Salva coordinate nel CSV
- Assegna distretto/comune via geofencing

## Struttura File

```
.
├── server.js                           # Server HTTP con API
├── generate-presidi-from-csv.js        # Genera GeoJSON da CSV (veloce)
├── process-presidi.js                  # Geocodifica indirizzi (lento)
├── process-data.js                     # Elabora distretti iniziali
├── data/
│   ├── presidi.csv                     # Database presidi (editabile)
│   ├── distretti-comuni.csv            # Mappatura comuni-distretti
│   ├── limits_P_83_municipalities.geojson
│   └── Circoscrizioni 2021.geojson
└── public/
    ├── index.html                      # Interfaccia mappa
    ├── distretti.geojson               # Distretti aggregati
    ├── distretti-detailed.geojson      # Features individuali
    └── presidi.geojson                 # Presidi geolocalizzati
```

## Formato CSV Presidi

Il file `data/presidi.csv` ha le seguenti colonne:

```csv
Nome struttura,Indirizzo,Latitudine,Longitudine,Distretto,Comune
```

- **Nome struttura**: Nome del presidio
- **Indirizzo**: Indirizzo completo
- **Latitudine**: Coordinata (lasciare vuoto per geocodifica)
- **Longitudine**: Coordinata (lasciare vuoto per geocodifica)
- **Distretto**: Auto-compilato via geofencing
- **Comune**: Auto-compilato via geofencing

## Workflow Aggiornamento Dati

### Aggiungere Nuovi Presidi

1. Aggiungi riga in `data/presidi.csv` con Nome struttura e Indirizzo
2. Lascia vuoti: Latitudine, Longitudine, Distretto, Comune
3. Esegui: `node process-presidi.js`
4. Riavvia il server: `node server.js`

### Correggere Coordinate Esistenti

1. Modifica manualmente Latitudine/Longitudine nel CSV
2. Lascia vuoti Distretto e Comune (saranno auto-compilati)
3. Riavvia il server: `node server.js`

### Editing Visuale

1. Apri http://localhost:3000
2. Right-click su marker presidio
3. Seleziona "Modifica posizione"
4. Trascina il marker
5. Right-click e "Salva posizione"

## API Endpoints

### GET /api/stats
Restituisce statistiche presidi:
```json
{
  "total": 94,
  "geocoded": 57,
  "missing": 37,
  "percentage": 61
}
```

### POST /api/update-presidio
Aggiorna coordinate presidio:
```json
{
  "nome": "Nome Presidio",
  "lat": 38.1234,
  "lon": 15.5678
}
```

## Distretti

- Messina (con 6 circoscrizioni)
- Milazzo
- Lipari
- Patti
- Sant'Agata Militello
- Mistretta
- Taormina
- Spadafora

## Tecnologie

- **Backend**: Node.js (HTTP server nativo)
- **Frontend**: HTML5, CSS3, JavaScript ES6
- **Mappa**: Leaflet.js 1.9.4
- **Dati**: GeoJSON, CSV
- **Geocoding**: Nominatim API (OpenStreetMap)

## Note Tecniche

### Geofencing
Utilizza algoritmo ray casting per point-in-polygon, determinando automaticamente distretto e comune da coordinate geografiche.

### Messina Città
Messina è divisa in 6 circoscrizioni per maggiore granularità, ma unificata come singolo distretto "Messina".

### Cache e Performance
- `generate-presidi-from-csv.js`: veloce, legge coordinate da CSV
- `process-presidi.js`: lento, chiama API esterna per geocodifica

## Copyright

© Ing. Roberto De Domenico per ASP 5 Messina

## Licenza

Uso interno ASP 5 Messina
