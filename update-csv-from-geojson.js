const fs = require('fs');
const path = require('path');

// Leggi il GeoJSON già generato
const presidiGeoJSON = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'presidi.geojson'), 'utf-8')
);

// Crea una mappa nome -> coordinate
const coordsMap = {};
presidiGeoJSON.features.forEach(feature => {
    const nome = feature.properties.nome;
    const [lon, lat] = feature.geometry.coordinates;
    coordsMap[nome] = {
        lat,
        lon,
        distretto: feature.properties.distretto,
        comune: feature.properties.comune
    };
});

// Leggi CSV
const csvPath = path.join(__dirname, 'data', 'presidi.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');
const headers = lines[0].split(',').map(h => h.trim());

// Aggiungi colonne se non presenti
if (!headers.includes('Latitudine')) headers.push('Latitudine');
if (!headers.includes('Longitudine')) headers.push('Longitudine');
if (!headers.includes('Distretto')) headers.push('Distretto');
if (!headers.includes('Comune')) headers.push('Comune');

const csvLines = [headers.join(',')];

// Process each line
for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse line
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());

    // Get nome struttura (first column)
    const nome = values[0];

    // Build row object
    const row = {};
    headers.forEach((header, idx) => {
        if (idx < values.length) {
            row[header] = values[idx];
        } else {
            row[header] = '';
        }
    });

    // Update with coordinates if available
    if (coordsMap[nome]) {
        row['Latitudine'] = coordsMap[nome].lat;
        row['Longitudine'] = coordsMap[nome].lon;
        row['Distretto'] = coordsMap[nome].distretto || '';
        row['Comune'] = coordsMap[nome].comune || '';
    }

    // Build CSV line
    const rowValues = headers.map(header => {
        const value = String(row[header] || '');
        // Quote if contains comma or quote
        if (value && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    });

    csvLines.push(rowValues.join(','));
}

// Save updated CSV
fs.writeFileSync(csvPath, csvLines.join('\n'));

console.log(`✓ CSV aggiornato con ${Object.keys(coordsMap).length} coordinate`);
console.log(`✓ File salvato: ${csvPath}`);
