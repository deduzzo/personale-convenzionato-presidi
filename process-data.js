const fs = require('fs');
const path = require('path');

// Leggi i file
function readCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',');

    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = values[i] || '';
        });
        return obj;
    });
}

function readGeoJSON(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Leggi i dati
console.log('Lettura file...');
const distretti = readCSV(path.join(__dirname, 'data', 'distretti-comuni.csv'));
const municipalities = readGeoJSON(path.join(__dirname, 'data', 'limits_P_83_municipalities.geojson'));
const circoscrizioni = readGeoJSON(path.join(__dirname, 'data', 'Circoscrizioni 2021.geojson'));

console.log(`Caricati ${distretti.length} comuni dal CSV`);
console.log(`Caricati ${municipalities.features.length} comuni dal GeoJSON`);
console.log(`Caricate ${circoscrizioni.features.length} circoscrizioni di Messina`);

// Crea una mappa comune -> distretto
const comuneToDistretto = {};
distretti.forEach(row => {
    const catasto = row['Cod.Catastale'].trim();
    let distretto = row['DISTRETTO'].trim();

    // Unisci "Messina Città" con "Messina"
    if (distretto === 'Messina Città') {
        distretto = 'Messina';
    }

    comuneToDistretto[catasto] = distretto;
});

// Crea una mappa distretto -> comuni
const distrettiMap = {};
distretti.forEach(row => {
    let distretto = row['DISTRETTO'].trim();
    const comune = row['Comune'].trim();
    const catasto = row['Cod.Catastale'].trim();

    // Unisci "Messina Città" con "Messina"
    if (distretto === 'Messina Città') {
        distretto = 'Messina';
    }

    if (!distrettiMap[distretto]) {
        distrettiMap[distretto] = {
            name: distretto,
            comuni: [],
            features: []
        };
    }

    distrettiMap[distretto].comuni.push({
        name: comune,
        catasto: catasto
    });
});

console.log(`Trovati ${Object.keys(distrettiMap).length} distretti`);

// Mappa i poligoni ai distretti
let messinaProcessed = false;

municipalities.features.forEach(feature => {
    const catasto = feature.properties.com_catasto_code;
    const comune = feature.properties.name;

    if (!catasto) return;

    // Gestione speciale per Messina
    if (catasto === 'F158') {
        if (!messinaProcessed) {
            console.log('Elaborazione speciale per Messina usando le circoscrizioni...');

            // Aggiungi ogni circoscrizione come feature separata per Messina
            circoscrizioni.features.forEach(circ => {
                const circName = circ.properties.LAYER;
                const distretto = comuneToDistretto[catasto];

                if (distretto && distrettiMap[distretto]) {
                    // Crea una feature per ogni circoscrizione
                    distrettiMap[distretto].features.push({
                        type: 'Feature',
                        properties: {
                            comune: `Messina - ${circName}`,
                            circoscrizione: circName,
                            isMessinaCircoscrizione: true
                        },
                        geometry: circ.geometry
                    });
                }
            });

            messinaProcessed = true;
        }
    } else {
        // Per tutti gli altri comuni
        const distretto = comuneToDistretto[catasto];

        if (distretto && distrettiMap[distretto]) {
            distrettiMap[distretto].features.push({
                type: 'Feature',
                properties: {
                    comune: comune,
                    catasto: catasto
                },
                geometry: feature.geometry
            });
        }
    }
});

// Crea il GeoJSON finale
const finalGeoJSON = {
    type: 'FeatureCollection',
    features: []
};

Object.keys(distrettiMap).forEach(distrettoName => {
    const distretto = distrettiMap[distrettoName];

    console.log(`Distretto: ${distrettoName} - ${distretto.features.length} features`);

    if (distretto.features.length > 0) {
        // Crea una FeatureCollection per ogni distretto
        const distrettoFeature = {
            type: 'Feature',
            properties: {
                distretto: distrettoName,
                comuni: distretto.comuni.map(c => c.name),
                numComuni: distretto.comuni.length
            },
            geometry: {
                type: 'GeometryCollection',
                geometries: distretto.features.map(f => f.geometry)
            }
        };

        finalGeoJSON.features.push(distrettoFeature);
    }
});

// Crea anche un file separato con tutte le geometrie individuali per hover
const detailedGeoJSON = {
    type: 'FeatureCollection',
    features: []
};

Object.keys(distrettiMap).forEach(distrettoName => {
    const distretto = distrettiMap[distrettoName];

    distretto.features.forEach(feature => {
        detailedGeoJSON.features.push({
            type: 'Feature',
            properties: {
                ...feature.properties,
                distretto: distrettoName
            },
            geometry: feature.geometry
        });
    });
});

// Salva i file
const outputDir = path.join(__dirname, 'public');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(
    path.join(outputDir, 'distretti.geojson'),
    JSON.stringify(finalGeoJSON, null, 2)
);

fs.writeFileSync(
    path.join(outputDir, 'distretti-detailed.geojson'),
    JSON.stringify(detailedGeoJSON, null, 2)
);

console.log('\nFile GeoJSON generati con successo!');
console.log('- public/distretti.geojson (distretti aggregati)');
console.log('- public/distretti-detailed.geojson (comuni individuali per hover)');
console.log(`\nTotale features nel file distretti: ${finalGeoJSON.features.length}`);
console.log(`Totale features nel file detailed: ${detailedGeoJSON.features.length}`);
