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
let labelOverlays = []; // Store all label overlays for collision detection
let comuneHoverLabel = null; // Hover label for comune name

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

// Custom Hover Label for Comune
class ComuneHoverLabel extends google.maps.OverlayView {
    constructor(position, text, map) {
        super();
        this.position = position;
        this.text = text;
        this.map = map;
        this.div = null;
        this.setMap(map);
    }

    onAdd() {
        const div = document.createElement('div');
        div.className = 'comune-hover-label';
        div.textContent = this.text;
        div.style.position = 'absolute';
        div.style.background = 'rgba(0, 0, 0, 0.8)';
        div.style.color = 'white';
        div.style.border = '2px solid white';
        div.style.borderRadius = '8px';
        div.style.padding = '12px 20px';
        div.style.fontSize = '18px';
        div.style.fontWeight = '700';
        div.style.whiteSpace = 'nowrap';
        div.style.pointerEvents = 'none';
        div.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
        div.style.zIndex = '2000';
        div.style.transform = 'translate(-50%, -50%)';

        this.div = div;
        const panes = this.getPanes();
        panes.overlayLayer.appendChild(div);
    }

    draw() {
        if (!this.div) return;

        const overlayProjection = this.getProjection();
        if (!overlayProjection) return;

        const pos = overlayProjection.fromLatLngToDivPixel(this.position);
        if (!pos) return;

        this.div.style.left = pos.x + 'px';
        this.div.style.top = pos.y + 'px';
    }

    onRemove() {
        if (this.div) {
            this.div.parentNode.removeChild(this.div);
            this.div = null;
        }
    }

    updatePosition(position) {
        this.position = position;
        this.draw();
    }
}

// Custom Label Overlay Class
class PresidioLabel extends google.maps.OverlayView {
    constructor(position, text, map) {
        super();
        this.position = position;
        this.text = text;
        this.map = map;
        this.div = null;
        this.visible = true;
        this.offset = { x: 0, y: 0 }; // For collision avoidance
        this.baseOffset = { x: 15, y: -10 }; // Base offset from marker
        this.connectorLine = null; // Polyline to connect label to marker when far
        this.setMap(map);
    }

    onAdd() {
        const div = document.createElement('div');
        div.className = 'presidio-label-overlay';
        div.textContent = this.text;
        div.style.position = 'absolute';
        div.style.background = 'rgba(255, 255, 255, 0.95)';
        div.style.border = '1px solid #333';
        div.style.borderRadius = '4px';
        div.style.padding = '4px 8px';
        div.style.fontSize = '12px';
        div.style.fontWeight = '600';
        div.style.whiteSpace = 'nowrap';
        div.style.pointerEvents = 'none';
        div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        div.style.zIndex = '1000';
        div.style.transition = 'font-size 0.2s ease, opacity 0.2s ease';

        this.div = div;
        const panes = this.getPanes();
        panes.overlayLayer.appendChild(div);
    }

    draw() {
        if (!this.div) return;

        const overlayProjection = this.getProjection();
        if (!overlayProjection) return;

        const pos = overlayProjection.fromLatLngToDivPixel(this.position);
        if (!pos) return;

        // Apply both base offset and collision avoidance offset
        const totalOffsetX = this.baseOffset.x + this.offset.x;
        const totalOffsetY = this.baseOffset.y + this.offset.y;

        this.div.style.left = (pos.x + totalOffsetX) + 'px';
        this.div.style.top = (pos.y + totalOffsetY) + 'px';
        this.div.style.display = this.visible ? 'block' : 'none';

        // Adjust font size based on zoom
        const zoom = this.map.getZoom();
        const fontSize = this.calculateFontSize(zoom);
        this.div.style.fontSize = fontSize + 'px';

        // Reduce opacity at low zoom levels
        if (zoom < 11) {
            this.div.style.opacity = '0.7';
        } else {
            this.div.style.opacity = '1';
        }

        // Show connector line if label is far from marker
        this.updateConnectorLine();
    }

    updateConnectorLine() {
        const distance = Math.sqrt(this.offset.x * this.offset.x + this.offset.y * this.offset.y);
        const threshold = 40; // pixels - show line if offset > 40px

        if (distance > threshold && this.visible) {
            // Calculate label center position
            const overlayProjection = this.getProjection();
            if (!overlayProjection) return;

            const markerPixel = overlayProjection.fromLatLngToDivPixel(this.position);
            const labelPixelX = markerPixel.x + this.baseOffset.x + this.offset.x;
            const labelPixelY = markerPixel.y + this.baseOffset.y + this.offset.y;

            // Convert pixel positions back to LatLng
            const labelLatLng = overlayProjection.fromDivPixelToLatLng(
                new google.maps.Point(labelPixelX, labelPixelY)
            );

            if (!this.connectorLine) {
                this.connectorLine = new google.maps.Polyline({
                    path: [this.position, labelLatLng],
                    geodesic: false,
                    strokeColor: '#666666',
                    strokeOpacity: 0.5,
                    strokeWeight: 1,
                    icons: [{
                        icon: {
                            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                            scale: 2,
                            strokeColor: '#666666',
                            strokeOpacity: 0.6
                        },
                        offset: '100%'
                    }, {
                        icon: {
                            path: 'M 0,-1 0,1',
                            strokeOpacity: 0.5,
                            scale: 2
                        },
                        offset: '0',
                        repeat: '8px'
                    }],
                    map: this.map,
                    zIndex: 999
                });
            } else {
                this.connectorLine.setPath([this.position, labelLatLng]);
            }
        } else {
            // Remove line if label is close enough
            if (this.connectorLine) {
                this.connectorLine.setMap(null);
                this.connectorLine = null;
            }
        }
    }

    calculateFontSize(zoom) {
        // Scale font size based on zoom level
        // zoom 8-10: smaller fonts (8-10px)
        // zoom 11-13: medium fonts (11-13px)
        // zoom 14+: larger fonts (14-16px)
        if (zoom <= 10) {
            return Math.max(8, 6 + zoom * 0.4);
        } else if (zoom <= 13) {
            return 10 + (zoom - 10) * 1;
        } else {
            return Math.min(16, 13 + (zoom - 13) * 0.5);
        }
    }

    onRemove() {
        if (this.div) {
            this.div.parentNode.removeChild(this.div);
            this.div = null;
        }
    }

    setVisible(visible) {
        this.visible = visible;
        this.draw();
        // Update connector line visibility
        if (!visible && this.connectorLine) {
            this.connectorLine.setMap(null);
            this.connectorLine = null;
        } else if (visible) {
            this.updateConnectorLine();
        }
    }

    setOffset(x, y) {
        this.offset = { x, y };
        this.draw();
    }

    getBounds() {
        if (!this.div) return null;
        const rect = this.div.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };
    }

    getPixelPosition() {
        if (!this.div) return null;
        const overlayProjection = this.getProjection();
        if (!overlayProjection) return null;
        return overlayProjection.fromLatLngToDivPixel(this.position);
    }

    onRemove() {
        if (this.div) {
            this.div.parentNode.removeChild(this.div);
            this.div = null;
        }
        if (this.connectorLine) {
            this.connectorLine.setMap(null);
            this.connectorLine = null;
        }
    }
}

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

    // Add zoom listener for label management
    map.addListener('zoom_changed', () => {
        // Redraw all labels with new size
        labelOverlays.forEach(label => label.draw());
        // Re-run collision detection after zoom
        setTimeout(() => resolveCollisions(), 100);
    });

    // Add idle listener to resolve collisions after panning
    map.addListener('idle', () => {
        resolveCollisions();
    });

    // Implement smooth zoom with mouse wheel
    implementSmoothZoom();
}

function implementSmoothZoom() {
    // Google Maps doesn't natively support fractional zoom with smooth transitions
    // We'll use a workaround: intercept scroll events and apply smaller zoom increments
    const mapDiv = document.getElementById('map');

    let currentFractionalZoom = map.getZoom();
    let isZooming = false;

    mapDiv.addEventListener('wheel', (e) => {
        e.preventDefault();

        if (isZooming) return;
        isZooming = true;

        const delta = e.deltaY > 0 ? -0.5 : 0.5; // Smaller increment (0.5 instead of 1)
        currentFractionalZoom = Math.max(8, Math.min(18, currentFractionalZoom + delta));

        map.setZoom(Math.round(currentFractionalZoom));

        setTimeout(() => {
            isZooming = false;
        }, 150); // Debounce zoom changes

    }, { passive: false });
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
            polygon.addListener('mouseover', (e) => {
                polygon.setOptions({ fillOpacity: 0.8, strokeWeight: 2 });
                infoBox.innerHTML = `<h3>${distretto}</h3><p><strong>Comune:</strong> ${comune}</p>`;
                infoBox.classList.add('show');

                // Show comune name on the map
                if (comuneHoverLabel) {
                    comuneHoverLabel.setMap(null);
                }
                const centerLatLng = getComuneCenter(polygon);
                comuneHoverLabel = new ComuneHoverLabel(centerLatLng, comune, map);
            });

            polygon.addListener('mouseout', () => {
                if (selectedDistretto !== distretto) {
                    polygon.setOptions({ fillOpacity: 0.5, strokeWeight: 1 });
                }
                infoBox.classList.remove('show');

                // Hide comune label
                if (comuneHoverLabel) {
                    comuneHoverLabel.setMap(null);
                    comuneHoverLabel = null;
                }
            });

            polygon.addListener('mousemove', (e) => {
                // Update label position to follow mouse (optional - you can remove this if you prefer centered label)
                if (comuneHoverLabel && e.latLng) {
                    comuneHoverLabel.updatePosition(e.latLng);
                }
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
                fontSize: '20px',
                className: 'presidio-marker-label'
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

        // Create custom text label overlay
        const labelOverlay = new PresidioLabel(
            { lat, lng: lon },
            props.nome,
            map
        );
        labelOverlays.push(labelOverlay);

        // Store reference for visibility toggling
        marker.labelOverlay = labelOverlay;

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

function getComuneCenter(polygon) {
    // Calculate the center of the polygon's bounds
    const bounds = new google.maps.LatLngBounds();
    polygon.getPaths().forEach(path => {
        path.forEach(latLng => bounds.extend(latLng));
    });
    return bounds.getCenter();
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
        // Toggle label overlay visibility
        if (mData.marker.labelOverlay) {
            mData.marker.labelOverlay.setVisible(visible);
        }
    }
    // Re-resolve collisions after visibility change
    setTimeout(() => resolveCollisions(), 100);
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

// --- Label Collision Detection & Resolution ---

function checkCollision(bounds1, bounds2) {
    if (!bounds1 || !bounds2) return false;

    // Add small padding to avoid labels being too close
    const padding = 5;

    return !(
        bounds1.right + padding < bounds2.left ||
        bounds1.left - padding > bounds2.right ||
        bounds1.bottom + padding < bounds2.top ||
        bounds1.top - padding > bounds2.bottom
    );
}

function resolveCollisions() {
    // Get only visible labels
    const visibleLabels = labelOverlays.filter(label => label.visible && label.div);

    if (visibleLabels.length < 2) return;

    // Reset all offsets first
    visibleLabels.forEach(label => {
        label.setOffset(0, 0);
    });

    // Force redraw to get accurate bounds
    visibleLabels.forEach(label => label.draw());

    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
        const maxIterations = 3; // Limit iterations to avoid infinite loops

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            let hasCollision = false;

            for (let i = 0; i < visibleLabels.length; i++) {
                const label1 = visibleLabels[i];
                const bounds1 = label1.getBounds();
                if (!bounds1) continue;

                for (let j = i + 1; j < visibleLabels.length; j++) {
                    const label2 = visibleLabels[j];
                    const bounds2 = label2.getBounds();
                    if (!bounds2) continue;

                    if (checkCollision(bounds1, bounds2)) {
                        hasCollision = true;

                        // Calculate repositioning strategy
                        const pos1 = label1.getPixelPosition();
                        const pos2 = label2.getPixelPosition();

                        if (!pos1 || !pos2) continue;

                        // Determine best direction to move labels
                        const dx = pos2.x - pos1.x;
                        const dy = pos2.y - pos1.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance === 0) continue;

                        // Calculate offset based on overlap amount
                        const overlapX = (bounds1.width + bounds2.width) / 2 - Math.abs(dx);
                        const overlapY = (bounds1.height + bounds2.height) / 2 - Math.abs(dy);

                        // Move labels apart
                        const moveAmount = Math.max(overlapX, overlapY) / 2 + 5;

                        if (Math.abs(dx) > Math.abs(dy)) {
                            // Move horizontally
                            if (dx > 0) {
                                label1.setOffset(label1.offset.x - moveAmount, label1.offset.y);
                                label2.setOffset(label2.offset.x + moveAmount, label2.offset.y);
                            } else {
                                label1.setOffset(label1.offset.x + moveAmount, label1.offset.y);
                                label2.setOffset(label2.offset.x - moveAmount, label2.offset.y);
                            }
                        } else {
                            // Move vertically
                            if (dy > 0) {
                                label1.setOffset(label1.offset.x, label1.offset.y - moveAmount);
                                label2.setOffset(label2.offset.x, label2.offset.y + moveAmount);
                            } else {
                                label1.setOffset(label1.offset.x, label1.offset.y + moveAmount);
                                label2.setOffset(label2.offset.x, label2.offset.y - moveAmount);
                            }
                        }

                        // Redraw to apply new positions
                        label1.draw();
                        label2.draw();
                    }
                }
            }

            // If no collisions found, we're done
            if (!hasCollision) break;
        }

        // Final optimization: hide labels that are too crowded at low zoom
        const zoom = map.getZoom();
        if (zoom < 11 && visibleLabels.length > 50) {
            // At low zoom with many labels, hide some to reduce clutter
            visibleLabels.forEach((label, index) => {
                // Keep every 3rd label visible
                if (index % 3 !== 0) {
                    label.setVisible(false);
                }
            });
        }
    }, 50);
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
