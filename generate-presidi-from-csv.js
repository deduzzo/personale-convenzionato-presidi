const fs = require('fs');
const path = require('path');

// Update CSV with missing distretto/comune based on coordinates
function updateMissingDistrettiInCSV() {
    const csvPath = path.join(__dirname, 'data', 'presidi.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const latIdx = headers.indexOf('Latitudine');
    const lonIdx = headers.indexOf('Longitudine');
    const nomeIdx = headers.indexOf('Nome struttura');
    const distIdx = headers.indexOf('Distretto');
    const comuneIdx = headers.indexOf('Comune');

    // Load distretti for geofencing
    const distrettiPath = path.join(__dirname, 'public', 'distretti-detailed.geojson');
    const distrettiData = JSON.parse(fs.readFileSync(distrettiPath, 'utf-8'));

    let updated = 0;
    const updatedLines = [lines[0]]; // Keep header

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            updatedLines.push('');
            continue;
        }

        // Parse CSV
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        // Ensure array has enough elements for all header indices
        while (values.length <= Math.max(nomeIdx, latIdx, lonIdx, distIdx, comuneIdx)) {
            values.push('');
        }

        const nome = values[nomeIdx] ? values[nomeIdx].replace(/^"|"$/g, '').trim() : '';
        const lat = values[latIdx] ? values[latIdx].trim() : '';
        const lon = values[lonIdx] ? values[lonIdx].trim() : '';
        const distretto = values[distIdx] ? values[distIdx].trim() : '';
        const comune = values[comuneIdx] ? values[comuneIdx].trim() : '';

        // If has coordinates but missing distretto/comune, update
        if (lat && lon && (!distretto || !comune)) {
            const latNum = parseFloat(lat);
            const lonNum = parseFloat(lon);

            if (!isNaN(latNum) && !isNaN(lonNum)) {
                const containingFeature = findContainingFeature(
                    [lonNum, latNum],
                    distrettiData.features
                );

                if (containingFeature) {
                    let newDistretto = containingFeature.properties.distretto;
                    const newComune = containingFeature.properties.comune;

                    // Unifica "Messina Città" con "Messina"
                    if (newDistretto === 'Messina Città') {
                        newDistretto = 'Messina';
                    }

                    values[distIdx] = newDistretto;
                    values[comuneIdx] = newComune;
                    updated++;

                    console.log(`✓ Updated: ${nome}`);
                    console.log(`   Distretto: ${newDistretto}, Comune: ${newComune}`);
                }
            }
        }

        // Rebuild line
        const newLine = values.map(v => {
            const val = String(v);
            if (val.includes(',') || val.includes('"')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(',');

        updatedLines.push(newLine);
    }

    // Save updated CSV if there were changes
    if (updated > 0) {
        fs.writeFileSync(csvPath, updatedLines.join('\n'));
        console.log(`\n✓ Updated ${updated} presidi with missing distretto/comune`);
    }

    return updated;
}

// Point-in-polygon check
function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;

    if (polygon.type === 'Polygon') {
        const coords = polygon.coordinates[0];
        for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
            const [xi, yi] = coords[i];
            const [xj, yj] = coords[j];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
    } else if (polygon.type === 'MultiPolygon') {
        for (const poly of polygon.coordinates) {
            const coords = poly[0];
            let polyInside = false;
            for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
                const [xi, yi] = coords[i];
                const [xj, yj] = coords[j];
                const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
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

function findContainingFeature(point, features) {
    for (const feature of features) {
        if (pointInPolygon(point, feature.geometry)) {
            return feature;
        }
    }
    return null;
}

function generatePresidiGeoJSON() {
    // Read CSV
    const csvPath = path.join(__dirname, 'data', 'presidi.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());

    const latIdx = headers.indexOf('Latitudine');
    const lonIdx = headers.indexOf('Longitudine');
    const nomeIdx = headers.indexOf('Nome struttura');
    const indIdx = headers.indexOf('Indirizzo');

    // Load distretti for geofencing
    const distrettiPath = path.join(__dirname, 'public', 'distretti-detailed.geojson');
    const distrettiData = JSON.parse(fs.readFileSync(distrettiPath, 'utf-8'));

    const presidiGeoJSON = {
        type: 'FeatureCollection',
        features: []
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        // Ensure array has enough elements for all header indices
        while (values.length <= Math.max(nomeIdx, indIdx, latIdx, lonIdx)) {
            values.push('');
        }

        const nome = values[nomeIdx] ? values[nomeIdx].replace(/^"|"$/g, '').trim() : '';
        const indirizzo = values[indIdx] ? values[indIdx].replace(/^"|"$/g, '').trim() : '';
        const lat = values[latIdx] ? values[latIdx].trim() : '';
        const lon = values[lonIdx] ? values[lonIdx].trim() : '';

        if (!nome || !lat || !lon) continue;

        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);

        if (isNaN(latNum) || isNaN(lonNum)) continue;

        // Find containing feature for geofencing
        const containingFeature = findContainingFeature(
            [lonNum, latNum],
            distrettiData.features
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
                coordinates: [lonNum, latNum]
            }
        });
    }

    // Save GeoJSON
    const outputPath = path.join(__dirname, 'public', 'presidi.geojson');
    fs.writeFileSync(outputPath, JSON.stringify(presidiGeoJSON, null, 2));

    return presidiGeoJSON.features.length;
}

// Export functions for use in server
if (require.main === module) {
    // Update missing distretto/comune first
    const updated = updateMissingDistrettiInCSV();

    // Then generate GeoJSON
    const count = generatePresidiGeoJSON();
    console.log(`✓ Generated presidi.geojson with ${count} presidi`);
} else {
    module.exports = {
        generatePresidiGeoJSON,
        updateMissingDistrettiInCSV
    };
}
