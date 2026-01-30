// js/main.js

// 1. BLOQUEO DE ZOOM NATIVO Y GESTOS (Mantenido)
document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
    let now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, false);

/**
 * Gestión de pestañas y layouts (Mantenido)
 */
function changeLayout(newLayout) {
    const dashboard = document.getElementById('main-dashboard');
    if (dashboard) dashboard.className = newLayout;

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    resizeAll();
    setTimeout(resizeAll, 100);
}

/**
 * Lector de archivos JSON Inteligente (Mantenido)
 */
document.getElementById('fileInput').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const raw = JSON.parse(event.target.result);
            if (raw.geometria) {
                appState.planta = raw;
                console.log("Planta cargada:", raw.geometria.length, "puntos");
                alert("✅ Planta cargada correctamente");
            } else {
                appState.secciones = raw.data || (Array.isArray(raw) ? raw : []);
                if (appState.secciones.length > 0) {
                    const slider = document.getElementById('stationSlider');
                    slider.max = appState.secciones.length - 1;
                    slider.value = 0;
                    appState.currentIdx = 0;
                    alert("✅ Secciones cargadas correctamente");
                }
            }
            resetView('seccion');
            resetView('planta');
            resizeAll();
        } catch (err) { 
            console.error("Error al leer JSON:", err);
            alert("❌ JSON no válido"); 
        }
    };
    reader.readAsText(e.target.files[0]);
});

/**
 * Control del Slider de Progresivas (Mantenido)
 */
document.getElementById('stationSlider').addEventListener('input', (e) => {
    appState.currentIdx = parseInt(e.target.value);
    syncAllViews();
});

// --- VARIABLES DE INTERACCIÓN ---
const canvasSec = document.getElementById('visorCanvas');
const canvasPlanta = document.getElementById('canvasPlanta'); // Agregado para Planta

// --- INTERACCIÓN SECCIÓN ---
canvasSec.addEventListener('mousedown', e => {
    appState.isDragging = true;
    appState.lastMousePos = { x: e.clientX, y: e.clientY };
    updateHUD(e); 
});

// --- INTERACCIÓN PLANTA (Nuevo) ---
canvasPlanta.addEventListener('mousedown', e => {
    if (!appState.planta) return;
    appState.isDraggingPlanta = true;
    appState.lastMousePos = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => { 
    appState.isDragging = false; 
    appState.isDraggingPlanta = false; 
});

window.addEventListener('mousemove', e => {
    // Pan de Sección (Mantenido)
    if (appState.isDragging) {
        const cam = appState.cameras.seccion;
        cam.x += (e.clientX - appState.lastMousePos.x) * window.devicePixelRatio;
        cam.y += (e.clientY - appState.lastMousePos.y) * window.devicePixelRatio;
        appState.lastMousePos = { x: e.clientX, y: e.clientY };
        syncAllViews();
    }
    // Pan de Planta (Nuevo)
    if (appState.isDraggingPlanta) {
        const cam = appState.cameras.planta;
        cam.x += (e.clientX - appState.lastMousePos.x) * window.devicePixelRatio;
        cam.y += (e.clientY - appState.lastMousePos.y) * window.devicePixelRatio;
        appState.lastMousePos = { x: e.clientX, y: e.clientY };
        syncAllViews();
    }
});

// --- LÓGICA DE ZOOM MEJORADA (Universal) ---
function aplicarZoom(cam, e, canvasElement) {
    const rect = canvasElement.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * window.devicePixelRatio;
    const mouseY = (e.clientY - rect.top) * window.devicePixelRatio;

    const worldX = (mouseX - cam.x) / cam.zoom;
    const worldY = (mouseY - cam.y) / cam.zoom;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    // Límites de zoom: 0.001 para ver todo el proyecto, 100 para ver detalle
    const newZoom = Math.min(Math.max(cam.zoom * zoomFactor, 0.001), 100);

    cam.zoom = newZoom;
    cam.x = mouseX - (worldX * cam.zoom);
    cam.y = mouseY - (worldY * cam.zoom);

    syncAllViews();
}

canvasSec.addEventListener('wheel', e => {
    e.preventDefault();
    aplicarZoom(appState.cameras.seccion, e, canvasSec);
}, { passive: false });

canvasPlanta.addEventListener('wheel', e => {
    e.preventDefault();
    aplicarZoom(appState.cameras.planta, e, canvasPlanta);
}, { passive: false });

/**
 * HUD: Coordenadas de ingeniería (Mantenido)
 */
function updateHUD(e) {
    if (!appState.secciones || !appState.transform) return;
    const cam = appState.cameras.seccion;
    const rect = canvasSec.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) * window.devicePixelRatio - cam.x) / cam.zoom;
    const vy = ((e.clientY - rect.top) * window.devicePixelRatio - cam.y) / cam.zoom;
    const rx = ((vx - appState.transform.mx) / appState.transform.scale) + appState.transform.minX;
    const ry = ((canvasSec.height - vy - appState.transform.my) / appState.transform.scale) + appState.transform.minY;
    appState.lastClick = { x: rx, y: ry };
    document.getElementById('hud').style.display = 'block';
    document.getElementById('hudX').innerText = rx.toFixed(2);
    document.getElementById('hudY').innerText = ry.toFixed(2);
    syncAllViews();
}

/**
 * Reajusta el tamaño de los lienzos (Mantenido)
 */
function resizeAll() {
    ['visorCanvas', 'canvasPlanta', 'canvasPerfil'].forEach(id => {
        const c = document.getElementById(id);
        if (c && c.clientWidth > 0) {
            c.width = c.clientWidth * window.devicePixelRatio;
            c.height = c.clientHeight * window.devicePixelRatio;
        }
    });
    syncAllViews();
}

function resetView(tipo) {
    if (appState.cameras[tipo]) {
        appState.cameras[tipo] = { x: 0, y: 0, zoom: 1 };
        syncAllViews();
    }
}

// Soporte Touch para Zoom (Mantenido para Sección)
let distInicial = null;
canvasSec.addEventListener('touchstart', e => {
    if (e.touches.length === 2) distInicial = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
}, { passive: false });

canvasSec.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && distInicial) {
        e.preventDefault();
        const distActual = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        const cam = appState.cameras.seccion;
        const delta = distActual / distInicial;
        const oldZoom = cam.zoom;
        cam.zoom = Math.min(Math.max(cam.zoom * delta, 0.1), 50);
        const midX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
        const midY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
        const rect = canvasSec.getBoundingClientRect();
        const ax = (midX - rect.left) * window.devicePixelRatio;
        const ay = (midY - rect.top) * window.devicePixelRatio;
        cam.x -= (ax - cam.x) * (cam.zoom / oldZoom - 1);
        cam.y -= (ay - cam.y) * (cam.zoom / oldZoom - 1);
        distInicial = distActual;
        syncAllViews();
    }
}, { passive: false });

canvasSec.addEventListener('touchend', () => { distInicial = null; });

// Búsqueda por PK (Mantenido)
const kmInput = document.getElementById('kmInput');
kmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        buscarProgresiva(kmInput.value);
        kmInput.blur();
    }
});

function buscarProgresiva(texto) {
    if (!appState.secciones) return;
    let valorBuscado = parseFloat(texto.replace('+', ''));
    if (isNaN(valorBuscado)) { syncAllViews(); return; }
    let mejorIndice = 0;
    let minimaDiferencia = Infinity;
    appState.secciones.forEach((seccion, index) => {
        let kActual = seccion.k || seccion.km || 0;
        let diferencia = Math.abs(kActual - valorBuscado);
        if (diferencia < minimaDiferencia) { minimaDiferencia = diferencia; mejorIndice = index; }
    });
    appState.currentIdx = mejorIndice;
    const slider = document.getElementById('stationSlider');
    if (slider) slider.value = mejorIndice;
    syncAllViews();
}

window.onload = resizeAll;
window.onresize = resizeAll;