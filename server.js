const http = require('http');
const fs = require('fs');
const path = require('path');
const { generatePresidiGeoJSON, updateMissingDistrettiInCSV } = require('./generate-presidi-from-csv');

const PORT = 3000;

// Update missing distretto/comune and generate presidi.geojson from CSV on startup
console.log('🔄 Checking for missing distretto/comune in CSV...');
try {
    const updated = updateMissingDistrettiInCSV();
    if (updated > 0) {
        console.log(`✓ Updated ${updated} presidi with missing distretto/comune`);
    } else {
        console.log('✓ All presidi with coordinates have distretto/comune assigned');
    }

    console.log('🔄 Generating presidi.geojson from CSV...');
    const count = generatePresidiGeoJSON();
    console.log(`✓ Generated ${count} presidi from CSV`);
} catch (error) {
    console.error('✗ Error processing presidi:', error.message);
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.geojson': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Function to update presidio coordinates in CSV
function updatePresidioCoordinates(nome, lat, lon) {
    const csvPath = path.join(__dirname, 'data', 'presidi.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const latIndex = headers.indexOf('Latitudine');
    const lonIndex = headers.indexOf('Longitudine');
    const nomeIndex = headers.indexOf('Nome struttura');

    const updatedLines = [lines[0]]; // Keep header

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line
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

        // Check if this is the presidio to update
        const lineNome = values[nomeIndex] ? values[nomeIndex].replace(/^"|"$/g, '') : '';

        if (lineNome === nome) {
            // Update coordinates
            values[latIndex] = lat;
            values[lonIndex] = lon;
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

    fs.writeFileSync(csvPath, updatedLines.join('\n'));
}

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // API endpoint to get statistics
    if (req.method === 'GET' && req.url === '/api/stats') {
        try {
            const csvPath = path.join(__dirname, 'data', 'presidi.csv');
            const content = fs.readFileSync(csvPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            const headers = lines[0].split(',').map(h => h.trim());

            const latIdx = headers.indexOf('Latitudine');
            const lonIdx = headers.indexOf('Longitudine');
            const nomeIdx = headers.indexOf('Nome struttura');

            let total = 0;
            let geocoded = 0;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const values = [];
                let current = '';
                let inQuotes = false;

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') { inQuotes = !inQuotes; }
                    else if (char === ',' && !inQuotes) { values.push(current); current = ''; }
                    else { current += char; }
                }
                values.push(current);

                const nome = values[nomeIdx] ? values[nomeIdx].replace(/^"|"$/g, '').trim() : '';
                if (!nome) continue;

                total++;

                const lat = values[latIdx] ? values[latIdx].trim() : '';
                const lon = values[lonIdx] ? values[lonIdx].trim() : '';

                if (lat && lon) {
                    geocoded++;
                }
            }

            const missing = total - geocoded;
            const percentage = total > 0 ? Math.round((geocoded / total) * 100) : 0;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                total,
                geocoded,
                missing,
                percentage
            }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }

    // API endpoint to update presidio coordinates
    if (req.method === 'POST' && req.url === '/api/update-presidio') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { nome, lat, lon } = data;

                if (!nome || !lat || !lon) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing required fields' }));
                    return;
                }

                // Update CSV
                updatePresidioCoordinates(nome, lat, lon);

                // Regenerate presidi.geojson from CSV
                const count = generatePresidiGeoJSON();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

                console.log(`✓ Updated coordinates for: ${nome}`);
                console.log(`✓ Regenerated presidi.geojson (${count} presidi)`);
            } catch (error) {
                console.error('Error updating presidio:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // Serve static files
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './public/index.html';
    } else if (!filePath.startsWith('./public/')) {
        filePath = './public' + req.url;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            // Inject BASE_PATH into HTML files
            if (extname === '.html' && content) {
                const BASE_PATH = process.env.BASE_PATH || '';
                let htmlContent = content.toString();
                // Inject BASE_PATH as a global variable before the first <script> tag
                htmlContent = htmlContent.replace(
                    '<script>',
                    `<script>window.BASE_PATH = '${BASE_PATH}';`
                );
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(htmlContent, 'utf-8');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Server avviato su http://localhost:${PORT}`);
    console.log(`\nApri il browser e vai su http://localhost:${PORT} per vedere la mappa\n`);
});
