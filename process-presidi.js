const fs = require('fs');
const path = require('path');
const https = require('https');

// Leggi CSV
function readCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());

    const rows = lines.slice(1).map(line => {
        // Parse CSV properly handling quoted values
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
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

        const obj = { _originalLine: line };
        headers.forEach((header, i) => {
            obj[header] = values[i] || '';
        });
        return obj;
    });

    return { headers, rows: rows.filter(row => row['Nome struttura'] && row['Indirizzo']) };
}

// Write CSV with coordinates
function writeCSVWithCoordinates(filePath, headers, rows, presidiData) {
    // Add new headers if not present
    if (!headers.includes('Latitudine')) {
        headers.push('Latitudine');
    }
    if (!headers.includes('Longitudine')) {
        headers.push('Longitudine');
    }
    if (!headers.includes('Distretto')) {
        headers.push('Distretto');
    }
    if (!headers.includes('Comune')) {
        headers.push('Comune');
    }

    const csvLines = [headers.join(',')];

    rows.forEach(row => {
        const nome = row['Nome struttura'];
        const presidioData = presidiData.find(p => p.nome === nome);

        if (presidioData && presidioData.coordinates) {
            row['Latitudine'] = presidioData.coordinates.lat;
            row['Longitudine'] = presidioData.coordinates.lon;
            row['Distretto'] = presidioData.distretto || '';
            row['Comune'] = presidioData.comune || '';
        }

        // Build CSV line
        const values = headers.map(header => {
            const value = String(row[header] || '');
            // Quote if contains comma or quote
            if (value.includes(',') || value.includes('"')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });

        csvLines.push(values.join(','));
    });

    fs.writeFileSync(filePath, csvLines.join('\n'));
}

// Geocode address using Nominatim
function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        const encodedAddress = encodeURIComponent(address);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;

        https.get(url, {
            headers: {
                'User-Agent': 'ASP-Messina-Map/1.0'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    if (results.length > 0) {
                        resolve({
                            lat: parseFloat(results[0].lat),
                            lon: parseFloat(results[0].lon)
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Check if point is inside polygon (ray casting algorithm)
function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;

    if (polygon.type === 'Polygon') {
        const coords = polygon.coordinates[0];
        for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
            const [xi, yi] = coords[i];
            const [xj, yj] = coords[j];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
    } else if (polygon.type === 'MultiPolygon') {
        for (const poly of polygon.coordinates) {
            const coords = poly[0];
            let polyInside = false;
            for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
                const [xi, yi] = coords[i];
                const [xj, yj] = coords[j];

                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) polyInside = !polyInside;
            }
            if (polyInside) {
                inside = true;
                break;
            }
        }
    }

    return inside;
}

// Find which feature contains a point
function findContainingFeature(point, features) {
    for (const feature of features) {
        if (pointInPolygon(point, feature.geometry)) {
            return feature;
        }
    }
    return null;
}

// Main processing
async function processPresidi() {
    console.log('Lettura file presidi.csv...');
    const csvData = readCSV(path.join(__dirname, 'data', 'presidi.csv'));
    const presidi = csvData.rows;
    console.log(`Trovati ${presidi.length} presidi`);

    console.log('\nLettura file distretti-detailed.geojson...');
    const distrettiGeoJSON = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'public', 'distretti-detailed.geojson'), 'utf-8')
    );
    console.log(`Caricati ${distrettiGeoJSON.features.length} features dei distretti`);

    const presidiGeoJSON = {
        type: 'FeatureCollection',
        features: []
    };

    const presidiData = []; // Store data for CSV update

    console.log('\nGeocoding degli indirizzi...');

    for (let i = 0; i < presidi.length; i++) {
        const presidio = presidi[i];
        const nome = presidio['Nome struttura'];
        const indirizzo = presidio['Indirizzo'];

        // Check if coordinates already exist in CSV
        const existingLat = presidio['Latitudine'];
        const existingLon = presidio['Longitudine'];

        console.log(`\n[${i + 1}/${presidi.length}] ${nome}`);
        console.log(`   Indirizzo: ${indirizzo}`);

        let coords = null;

        if (existingLat && existingLon) {
            coords = {
                lat: parseFloat(existingLat),
                lon: parseFloat(existingLon)
            };
            console.log(`   ℹ Coordinate esistenti: ${coords.lat}, ${coords.lon}`);
        } else {
            try {
                // Wait to respect API rate limits
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                coords = await geocodeAddress(indirizzo);

                if (coords) {
                    console.log(`   ✓ Geocoding: ${coords.lat}, ${coords.lon}`);
                } else {
                    console.log(`   ✗ Geocoding fallito`);
                }
            } catch (error) {
                console.log(`   ✗ Errore: ${error.message}`);
            }
        }

        if (coords) {
            // Find containing feature (comune/circoscrizione)
            const containingFeature = findContainingFeature(
                [coords.lon, coords.lat],
                distrettiGeoJSON.features
            );

            let distretto = null;
            let comune = null;

            if (containingFeature) {
                distretto = containingFeature.properties.distretto;
                comune = containingFeature.properties.comune;

                // Unifica "Messina Città" con "Messina"
                if (distretto === 'Messina Città') {
                    distretto = 'Messina';
                }

                console.log(`   ✓ Distretto: ${distretto}`);
                console.log(`   ✓ Comune: ${comune}`);
            } else {
                console.log(`   ⚠ Fuori dai confini dei distretti`);
            }

            presidiGeoJSON.features.push({
                type: 'Feature',
                properties: {
                    nome: nome,
                    indirizzo: indirizzo,
                    distretto: distretto,
                    comune: comune
                },
                geometry: {
                    type: 'Point',
                    coordinates: [coords.lon, coords.lat]
                }
            });

            // Store for CSV update
            presidiData.push({
                nome: nome,
                coordinates: coords,
                distretto: distretto,
                comune: comune
            });
        } else {
            // Store empty data for CSV
            presidiData.push({
                nome: nome,
                coordinates: null,
                distretto: null,
                comune: null
            });
        }
    }

    // Save GeoJSON
    const outputPath = path.join(__dirname, 'public', 'presidi.geojson');
    fs.writeFileSync(outputPath, JSON.stringify(presidiGeoJSON, null, 2));

    // Update CSV with coordinates
    const csvPath = path.join(__dirname, 'data', 'presidi.csv');
    writeCSVWithCoordinates(csvPath, csvData.headers, csvData.rows, presidiData);

    console.log(`\n\n✓ File GeoJSON salvato: ${outputPath}`);
    console.log(`✓ File CSV aggiornato: ${csvPath}`);
    console.log(`✓ Presidi geocodificati: ${presidiGeoJSON.features.length}/${presidi.length}`);

    // Count presidi per distretto
    const conteggio = {};
    presidiGeoJSON.features.forEach(feature => {
        const distretto = feature.properties.distretto;
        if (distretto) {
            conteggio[distretto] = (conteggio[distretto] || 0) + 1;
        }
    });

    console.log('\n--- Presidi per distretto ---');
    Object.keys(conteggio).sort().forEach(distretto => {
        console.log(`${distretto}: ${conteggio[distretto]} presidi`);
    });
}

processPresidi().catch(console.error);
