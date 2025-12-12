// Google Maps Implementation

let map;
let distrettiLayers = {}; // Store data layers by distretto
let allFeatures = []; // Store all features for search
let presidiMarkers = {}; // Store presidi markers by distretto
let presidiCounts = {}; // Count presidi per distretto
let presidiCountsByComune = {}; // Count presidi per comune
let comuneFeatures = {}; // Store features by comune for zooming
let selectedDistretto = null;
let editingMarker = null;
const infoBox = document.getElementById('info-box');
const contextMenu = document.getElementById('context-menu');
let allPresidiMarkers = []; // Store all presidi markers
let presidiVisibility = {}; // Track visibility state
let presidiLabels = {}; // Store labels for print

// Distance measurement state
let measuringDistance = false;
let firstMeasurePoint = null;
let distanceLine = null;
let distanceMarkers = [];

// Colors for districts (same as Leaflet)
const colors = [
    '#667eea', '#764ba2', '#f093fb', '#f5576c',
    '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
    '#fa709a', '#fee140', '#30cfd0', '#330867'
];

async function initGoogleApp() {
    await loadConfig();

    // Initialize Map
    const mapOptions = {
        center: { lat: 38.19, lng: 15.25 },
        zoom: 10,
        mapTypeId: 'roadmap',
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        styles: [
            {
                featureType: "poi.medical",
                stylers: [{ visibility: "off" }] // Hide default medical icons to avoid clutter
            }
        ]
    };

    map = new google.maps.Map(document.getElementById('map'), mapOptions);

    // Load Stats
    loadStats();

    // Load Data
    Promise.all([
        fetch(BASE_PATH + '/distretti-detailed.geojson').then(r => r.json()),
        fetch(BASE_PATH + '/presidi.geojson').then(r => r.json())
    ]).then(([detailedData, presidiData]) => {
        processData(detailedData, presidiData);
    }).catch(console.error);

    // Setup UI Events
    setupUIEvents();
}

function loadStats() {
    fetch(BASE_PATH + '/api/stats')
        .then(r => r.json())
        .then(stats => {
            const missingElement = document.getElementById('stats-missing');
            if (stats.missing === 0) {
                missingElement.style.display = 'none';
            } else {
                missingElement.textContent = `❌ ${stats.missing} presidi non geolocalizzati`;
            }
            document.getElementById('stats-success').textContent =
                `✓ ${stats.percentage}% geolocalizzati (${stats.geocoded}/${stats.total})`;
        })
        .catch(console.error);
}

function processData(detailedData, presidiData) {
    const distrettiData = {};

    // Process Districts
    detailedData.features.forEach(feature => {
        const distretto = feature.properties.distretto;
        if (!distrettiData[distretto]) {
            distrettiData[distretto] = { features: [], comuni: new Set() };
        }
        distrettiData[distretto].features.push(feature);
        if (feature.properties.comune) {
            distrettiData[distretto].comuni.add(feature.properties.comune);
        }
    });

    const distrettiNames = Object.keys(distrettiData).sort();

    // Render Districts
    distrettiNames.forEach((distretto, index) => {
        const color = colors[index % colors.length];
        const data = distrettiData[distretto];

        distrettiLayers[distretto] = {
            features: [],
            color: color,
            visible: true
        };

        data.features.forEach(feature => {
            const comune = feature.properties.comune;

            // Store for search
            allFeatures.push({
                comune: comune,
                distretto: distretto,
                feature: feature,
                color: color
            });

            // Store for zooming
            if (!comuneFeatures[comune]) {
                comuneFeatures[comune] = [];
            }

            // Convert GeoJSON polygon to Google Maps paths
            const paths = convertGeoJSONToPaths(feature.geometry);

            // Create Polygon
            const polygon = new google.maps.Polygon({
                paths: paths,
                strokeColor: 'white',
                strokeOpacity: 1,
                strokeWeight: 1,
                fillColor: color,
                fillOpacity: 0.5,
                map: map
            });

            // Store original feature for bounds calculation later
            polygon.feature = feature;

            // Events
            polygon.addListener('mouseover', () => {
                polygon.setOptions({ fillOpacity: 0.8, strokeWeight: 2 });
                infoBox.innerHTML = `<h3>${distretto}</h3><p><strong>Comune:</strong> ${comune}</p>`;
                infoBox.classList.add('show');
            });

            polygon.addListener('mouseout', () => {
                if (selectedDistretto !== distretto) {
                    polygon.setOptions({ fillOpacity: 0.5, strokeWeight: 1 });
                }
                infoBox.classList.remove('show');
            });

            polygon.addListener('click', (e) => {
                selectedDistretto = distretto;
                const comuniArray = Array.from(data.comuni).sort();

                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div class="popup-title">${distretto}</div>
                        <div class="popup-text">
                            <strong>Comuni (${comuniArray.length}):</strong><br>
                            ${comuniArray.join(', ')}
                        </div>
                    `,
                    position: e.latLng
                });
                infoWindow.open(map);
            });

            distrettiLayers[distretto].features.push(polygon);
            comuneFeatures[comune].push(polygon);
        });
    });

    // Process Presidi
    const presidiByComune = {};
    presidiData.features.forEach(presidio => {
        const props = presidio.properties;
        if (props.distretto) presidiCounts[props.distretto] = (presidiCounts[props.distretto] || 0) + 1;
        if (props.comune) {
            presidiCountsByComune[props.comune] = (presidiCountsByComune[props.comune] || 0) + 1;
            if (!presidiByComune[props.comune]) presidiByComune[props.comune] = [];
            presidiByComune[props.comune].push(presidio);
        }
    });

    // Render Presidi Markers
    presidiData.features.forEach((presidio, index) => {
        const [lon, lat] = presidio.geometry.coordinates;
        const props = presidio.properties;

        const marker = new google.maps.Marker({
            position: { lat, lng: lon },
            map: map,
            title: props.nome, // Tooltip
            label: {
                text: '🏥',
                fontSize: '24px',
                className: 'presidio-marker-label' // We might need CSS for this
            },
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 0, // Hide default pin, just show label
            },
            draggable: false
        });

        marker.presidioData = {
            nome: props.nome,
            indirizzo: props.indirizzo,
            distretto: props.distretto,
            comune: props.comune
        };

        // Click Listener
        marker.addListener('click', (e) => {
            if (handlePresidioClickForDistance(marker, e.latLng, props.nome)) return;

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div class="popup-title">${props.nome}</div>
                    <div class="popup-text">
                        <strong>Indirizzo:</strong> ${props.indirizzo}<br>
                        ${props.distretto ? `<strong>Distretto:</strong> ${props.distretto}<br>` : ''}
                        ${props.comune ? `<strong>Comune:</strong> ${props.comune}` : ''}
                    </div>
                `
            });
            infoWindow.open(map, marker);
        });

        // Right Click (Context Menu)
        google.maps.event.addListener(marker, 'rightclick', (e) => {
            showContextMenu(e, marker);
        });

        // Drag End (for editing)
        marker.addListener('dragend', () => {
            // Position updated automatically
        });

        // Store Marker Data
        const markerData = {
            id: index,
            marker: marker,
            nome: props.nome,
            distretto: props.distretto,
            comune: props.comune,
            lat: lat,
            lon: lon
        };
        allPresidiMarkers.push(markerData);

        // Create label for print (hidden div)
        const labelDiv = document.createElement('div');
        labelDiv.className = 'presidio-label';
        labelDiv.textContent = props.nome;
        document.body.appendChild(labelDiv);
        presidiLabels[props.nome] = { ...markerData, labelDiv };

        if (props.distretto) {
            if (!presidiMarkers[props.distretto]) presidiMarkers[props.distretto] = [];
            presidiMarkers[props.distretto].push(marker);
        }
    });

    // Populate Sidebar
    populateSidebar(distrettiNames, distrettiData, presidiByComune);

    // Load Visibility
    loadPresidiVisibility();

    // Fit Bounds
    fitMapToData(detailedData);
}

function convertGeoJSONToPaths(geometry) {
    const paths = [];
    const coords = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

    coords.forEach(poly => {
        poly.forEach(ring => {
            const path = ring.map(c => ({ lat: c[1], lng: c[0] }));
            paths.push(path);
        });
    });
    return paths;
}

function populateSidebar(distrettiNames, distrettiData, presidiByComune) {
    const legendContent = document.getElementById('legend-content');
    const distrettiList = document.getElementById('distretti-list');

    distrettiNames.forEach((distretto, index) => {
        const color = colors[index % colors.length];
        const data = distrettiData[distretto];
        const comuniArray = Array.from(data.comuni).sort();

        // Legend Item
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        const safeId = distretto.replace(/[\s.]+/g, '-');
        legendItem.innerHTML = `
            <input type="checkbox" id="checkbox-${safeId}" checked>
            <label for="checkbox-${safeId}">
                <div class="legend-color" style="background-color: ${color}"></div>
                <span>${distretto}</span>
            </label>
        `;
        legendContent.appendChild(legendItem);

        // Legend Checkbox Event
        legendItem.querySelector('input').addEventListener('change', function () {
            const visible = this.checked;
            toggleDistrettoVisibility(distretto, visible);
        });

        // Distretto List Item
        const distrettoInfo = document.createElement('div');
        distrettoInfo.className = 'distretto-info';
        distrettoInfo.innerHTML = `
            <div class="distretto-name" style="color: ${color}">
                <input type="checkbox" id="toggle-presidi-${safeId}" checked>
                <label for="toggle-presidi-${safeId}">${distretto}</label>
            </div>
            <ul class="comuni-list" id="comuni-list-${safeId}"></ul>
        `;
        distrettiList.appendChild(distrettoInfo);

        // Toggle Presidi Event
        document.getElementById(`toggle-presidi-${safeId}`).addEventListener('change', function () {
            togglePresidiVisibility(distretto, this.checked);
        });

        // Comuni List
        const comuniList = distrettoInfo.querySelector('.comuni-list');
        comuniArray.forEach(comune => {
            const count = presidiCountsByComune[comune] || 0;
            const li = document.createElement('li');
            li.dataset.comune = comune;

            const span = document.createElement('span');
            span.textContent = comune;
            span.style.cursor = 'pointer';
            span.onclick = (e) => {
                e.stopPropagation();
                zoomToComune(comune);
            };
            li.appendChild(span);

            if (count > 0) {
                const badge = document.createElement('span');
                badge.className = 'comune-presidio-count';
                badge.textContent = `${count} 🏥`;
                li.appendChild(badge);
            }
            comuniList.appendChild(li);

            // Add Presidi List under Comune
            if (presidiByComune[comune]) {
                const ul = document.createElement('ul');
                ul.className = 'presidi-comune-list';
                presidiByComune[comune].forEach(presidio => {
                    const pName = presidio.properties.nome;
                    const pLi = document.createElement('li');
                    pLi.className = 'presidio-item';
                    const pId = allPresidiMarkers.find(m => m.nome === pName).id;

                    pLi.innerHTML = `
                        <input type="checkbox" id="presidio-${pId}" checked>
                        <label for="presidio-${pId}" title="${pName}">${pName}</label>
                    `;

                    pLi.querySelector('input').addEventListener('change', function () {
                        toggleSinglePresidioVisibility(pName, this.checked);
                    });

                    ul.appendChild(pLi);
                });
                comuniList.appendChild(ul);
            }
        });

        // Add count to legend
        const count = presidiCounts[distretto] || 0;
        if (count > 0) {
            const label = legendItem.querySelector('label');
            const badge = document.createElement('span');
            badge.className = 'presidio-count';
            badge.textContent = `${count} P`;
            label.appendChild(badge);
        }
    });
}

function toggleDistrettoVisibility(distretto, visible) {
    if (distrettiLayers[distretto]) {
        distrettiLayers[distretto].features.forEach(poly => {
            poly.setMap(visible ? map : null);
        });
    }
    togglePresidiVisibility(distretto, visible);
}

function togglePresidiVisibility(distretto, visible) {
    if (presidiMarkers[distretto]) {
        presidiMarkers[distretto].forEach(marker => {
            const name = marker.presidioData.nome;
            toggleSinglePresidioVisibility(name, visible);
            // Update checkbox
            const mData = allPresidiMarkers.find(m => m.nome === name);
            if (mData) {
                const cb = document.getElementById(`presidio-${mData.id}`);
                if (cb) cb.checked = visible;
            }
        });
    }
}

function toggleSinglePresidioVisibility(nome, visible) {
    presidiVisibility[nome] = visible;
    const mData = allPresidiMarkers.find(m => m.nome === nome);
    if (mData) {
        mData.marker.setMap(visible ? map : null);
    }
}

function zoomToComune(comune) {
    const polys = comuneFeatures[comune];
    if (polys && polys.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        polys.forEach(poly => {
            poly.getPaths().forEach(path => {
                path.forEach(latLng => bounds.extend(latLng));
            });
        });
        map.fitBounds(bounds);
    }
}

function fitMapToData(geoJson) {
    const bounds = new google.maps.LatLngBounds();
    // Iterate through all features to build bounds
    // Since we already have polygons created, we can use them
    Object.values(distrettiLayers).forEach(layer => {
        layer.features.forEach(poly => {
            poly.getPaths().forEach(path => {
                path.forEach(latLng => bounds.extend(latLng));
            });
        });
    });
    map.fitBounds(bounds);
}

// --- Interactions & Tools ---

function showContextMenu(e, marker) {
    const domEvent = e.domEvent || e; // Google Maps event might wrap DOM event
    const x = domEvent.pageX;
    const y = domEvent.pageY;

    editingMarker = marker;
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('show');

    // Update menu items visibility based on draggable
    const isDraggable = marker.getDraggable();
    document.getElementById('menu-edit').style.display = isDraggable ? 'none' : 'block';
    document.getElementById('menu-save').style.display = isDraggable ? 'block' : 'none';
    document.getElementById('menu-measure').style.display = isDraggable ? 'none' : 'block';
}

function setupUIEvents() {
    // Hide context menu on map click
    map.addListener('click', () => {
        contextMenu.classList.remove('show');
        clearDistanceMeasurement();
    });

    // Edit Position
    document.getElementById('menu-edit').addEventListener('click', () => {
        if (editingMarker) {
            editingMarker.setDraggable(true);
            contextMenu.classList.remove('show');
        }
    });

    // Save Position
    document.getElementById('menu-save').addEventListener('click', async () => {
        if (editingMarker) {
            const pos = editingMarker.getPosition();
            const nome = editingMarker.presidioData.nome;

            try {
                const response = await fetch(BASE_PATH + '/api/update-presidio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: nome,
                        lat: pos.lat(),
                        lon: pos.lng()
                    })
                });
                const result = await response.json();
                if (result.success) {
                    editingMarker.setDraggable(false);
                    alert(`✓ Posizione salvata per ${nome}`);
                } else {
                    alert(`✗ Errore: ${result.error}`);
                }
            } catch (err) {
                alert(`✗ Errore: ${err.message}`);
            }
            contextMenu.classList.remove('show');
            editingMarker = null;
        }
    });

    // Measure Distance
    document.getElementById('menu-measure').addEventListener('click', () => {
        if (editingMarker) {
            clearDistanceMeasurement();
            measuringDistance = true;
            firstMeasurePoint = {
                latLng: editingMarker.getPosition(),
                nome: editingMarker.presidioData.nome
            };

            // Add marker for first point
            const m1 = new google.maps.Marker({
                position: firstMeasurePoint.latLng,
                map: map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 5,
                    fillColor: '#f59e0b',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: 'white'
                }
            });
            distanceMarkers.push(m1);

            contextMenu.classList.remove('show');
            alert(`Primo punto: ${firstMeasurePoint.nome}. Clicca su un altro presidio.`);
        }
    });

    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const results = document.getElementById('search-results');
        results.innerHTML = '';
        if (term.length < 2) return;

        const matches = allFeatures.filter(i => i.comune.toLowerCase().includes(term)).slice(0, 10);

        if (matches.length === 0) {
            results.innerHTML = '<div class="search-no-results">Nessun comune trovato</div>';
            return;
        }

        matches.forEach(match => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<div class="search-result-comune">${match.comune}</div><div class="search-result-distretto">${match.distretto}</div>`;
            div.onclick = () => {
                zoomToComune(match.comune);
                results.innerHTML = '';
                document.getElementById('search-input').value = '';
            };
            results.appendChild(div);
        });
    });

    // Save/Reset/Print Buttons
    document.getElementById('btn-save').addEventListener('click', savePresidiVisibility);
    document.getElementById('btn-reset').addEventListener('click', resetPresidiVisibility);
    document.getElementById('btn-print').addEventListener('click', printMap);

    // Map Type Buttons
    setupMapTypeButtons();
}

function setupMapTypeButtons() {
    const mapTypes = {
        'map-type-roadmap': 'roadmap',
        'map-type-satellite': 'satellite',
        'map-type-hybrid': 'hybrid',
        'map-type-terrain': 'terrain'
    };

    Object.keys(mapTypes).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                // Update map type
                map.setMapTypeId(mapTypes[btnId]);

                // Update active button
                document.querySelectorAll('.map-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Save preference
                localStorage.setItem('map-type', mapTypes[btnId]);
            });
        }
    });

    // Load saved preference
    const savedMapType = localStorage.getItem('map-type');
    if (savedMapType && Object.values(mapTypes).includes(savedMapType)) {
        map.setMapTypeId(savedMapType);
        document.querySelectorAll('.map-type-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = Object.keys(mapTypes).find(key => mapTypes[key] === savedMapType);
        if (activeBtn) {
            document.getElementById(activeBtn)?.classList.add('active');
        }
    }
}

function handlePresidioClickForDistance(marker, latLng, nome) {
    if (measuringDistance && firstMeasurePoint) {
        // Add second marker
        const m2 = new google.maps.Marker({
            position: latLng,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 5,
                fillColor: '#f59e0b',
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: 'white'
            }
        });
        distanceMarkers.push(m2);

        // Draw Line
        distanceLine = new google.maps.Polyline({
            path: [firstMeasurePoint.latLng, latLng],
            geodesic: true,
            strokeColor: '#f59e0b',
            strokeOpacity: 1.0,
            strokeWeight: 3,
            icons: [{
                icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                offset: '0',
                repeat: '10px'
            }],
            map: map
        });

        // Calculate Distance
        const distKm = (google.maps.geometry.spherical.computeDistanceBetween(firstMeasurePoint.latLng, latLng) / 1000).toFixed(2);

        // Show InfoWindow
        const midLat = (firstMeasurePoint.latLng.lat() + latLng.lat()) / 2;
        const midLng = (firstMeasurePoint.latLng.lng() + latLng.lng()) / 2;

        const infoWindow = new google.maps.InfoWindow({
            position: { lat: midLat, lng: midLng },
            content: `
                <div class="popup-title">📏 Distanza</div>
                <div class="popup-text">
                    <strong>Da:</strong> ${firstMeasurePoint.nome}<br>
                    <strong>A:</strong> ${nome}<br>
                    <strong>Distanza:</strong> ${distKm} km
                </div>
            `
        });
        infoWindow.open(map);

        measuringDistance = false;
        firstMeasurePoint = null;
        return true;
    }
    return false;
}

function clearDistanceMeasurement() {
    if (distanceLine) distanceLine.setMap(null);
    distanceMarkers.forEach(m => m.setMap(null));
    distanceMarkers = [];
    distanceLine = null;
    measuringDistance = false;
}

function savePresidiVisibility() {
    localStorage.setItem('presidi-visibility', JSON.stringify(presidiVisibility));
    alert('✓ Stato salvato!');
}

function loadPresidiVisibility() {
    const saved = localStorage.getItem('presidi-visibility');
    if (saved) {
        presidiVisibility = JSON.parse(saved);
        Object.keys(presidiVisibility).forEach(nome => {
            toggleSinglePresidioVisibility(nome, presidiVisibility[nome]);
            // Update checkbox
            const mData = allPresidiMarkers.find(m => m.nome === nome);
            if (mData) {
                const cb = document.getElementById(`presidio-${mData.id}`);
                if (cb) cb.checked = presidiVisibility[nome];
            }
        });
    }
}

function resetPresidiVisibility() {
    if (confirm('Ripristinare tutto?')) {
        localStorage.removeItem('presidi-visibility');
        allPresidiMarkers.forEach(m => {
            toggleSinglePresidioVisibility(m.nome, true);
            const cb = document.getElementById(`presidio-${m.id}`);
            if (cb) cb.checked = true;
        });
    }
}

function printMap() {
    // Simple print trigger for now, Google Maps handles printing reasonably well
    // but custom labels would require overlay views which are complex.
    // We'll rely on the hidden DOM labels we created if we want to implement that,
    // but for now standard print.

    // To make labels visible for print, we would need to position them over the map
    // using the projection.
    updatePrintLabels();
    window.print();
}

function updatePrintLabels() {
    // This is a simplified version. Accurate positioning requires OverlayView.
    // For this iteration, we might skip complex custom print labels or implement
    // a basic OverlayView if strictly needed.
    // Given the complexity, we will rely on the map's visual state.
}
