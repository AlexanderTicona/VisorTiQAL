// js/main.js

// 1. BLOQUEO DE GESTOS NATIVOS (Previene recargas indeseadas en móvil)
document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
    let now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, false);

// 2. GESTIÓN DE LAYOUTS
function changeLayout(newLayout) {
    const modal = document.getElementById('settingsModal');
    if (modal && modal.style.display !== 'none') toggleSettings();

    const dashboard = document.getElementById('main-dashboard');
    if (!dashboard) return;
    dashboard.className = newLayout;

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }

    requestAnimationFrame(() => {
        resizeAll();
        if (appState.planta) resetView('planta');
        if (appState.secciones && appState.secciones.length > 0) resetView('seccion');
        if (appState.perfil) resetView('perfil');
        syncAllViews();
    });
}

// 3. LECTOR DE ARCHIVOS MEJORADO (Detecta Capas)
document.getElementById('fileInput').addEventListener('change', function (e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const raw = JSON.parse(event.target.result);
            let datosCargados = false;

            // RESET DE ESTILOS
            appConfig.layers = { planta: {}, perfil: {}, seccion: {} };

            // --- A. PLANTA ---
            const plantaArr = raw.planta_trazo || raw.planta;
            if (plantaArr) {
                appState.planta = raw;
                // Registrar Capa Eje por defecto
                appConfig.layers.planta['Eje'] = { color: '#ff0000', width: 2, visible: true, type: 'line' };

                let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
                plantaArr.forEach(pt => {
                    const x = pt.length >= 3 ? pt[1] : pt[0];
                    const y = pt.length >= 3 ? pt[2] : pt[1];
                    if (x < minE) minE = x; if (x > maxE) maxE = x;
                    if (y < minN) minN = y; if (y > maxN) maxN = y;
                });
                appState.limitesGlobales.planta = { minE: minE - 500, maxE: maxE + 500, minN: minN - 500, maxN: maxN + 500 };
                appState.encuadre.planta = { minE, maxE, minN, maxN };
                datosCargados = true;
            }

            // --- B. PERFIL ---
            if (raw.perfiles) {
                appState.perfil = raw.perfiles;
                let minK = Infinity, maxK = -Infinity, minZ = Infinity, maxZ = -Infinity;

                // Generar Estilos Dinámicos
                raw.perfiles.forEach((p, idx) => {
                    // Colores por defecto según nombre
                    let defColor = '#ffffff';
                    let defWidth = 1.5;
                    const nombre = p.nombre || `Perfil ${idx + 1}`;

                    if (nombre.includes("TN") || nombre.includes("Surface")) { defColor = "#8b4513"; defWidth = 1.5; } // Terreno
                    else if (nombre.includes("Rasante") || nombre.includes("FG") || nombre.includes("Layout")) { defColor = "#FF0000"; defWidth = 2.5; } // Rojo
                    else {
                        const palette = ["#FFD700", "#FF00FF", "#00FFFF", "#FFA500"];
                        defColor = palette[idx % palette.length];
                    }

                    appConfig.layers.perfil[nombre] = { color: defColor, width: defWidth, visible: true, id: idx };

                    // Calcular límites
                    if (p.data) p.data.forEach(pt => {
                        if (pt[0] < minK) minK = pt[0]; if (pt[0] > maxK) maxK = pt[0];
                        if (pt[1] < minZ) minZ = pt[1]; if (pt[1] > maxZ) maxZ = pt[1];
                    });
                });

                if (minK !== Infinity) {
                    const altoZ = maxZ - minZ;
                    appState.limitesGlobales.perfil = { minK, maxK, minZ: minZ - (altoZ * 0.2), maxZ: maxZ + (altoZ * 0.2) };
                    appState.encuadre.perfil = { minK, maxK, minZ, maxZ };
                    datosCargados = true;
                }
            }

            // --- C. SECCIONES ---
            if (raw.secciones) {
                appState.secciones = raw.secciones;

                // Registrar Capas de Sección (Superficies)
                if (raw.info && raw.info.CapasTerreno) {
                    raw.info.CapasTerreno.forEach((nombre, idx) => {
                        appConfig.layers.seccion[`Sup: ${nombre}`] = { color: '#8b4513', width: 2, visible: true, type: 't', idx: idx };
                    });
                } else {
                    // Fallback si no hay info
                    appConfig.layers.seccion['Terreno'] = { color: '#8b4513', width: 2, visible: true, type: 't', idx: 0 };
                }
                // Capa Corredor General
                appConfig.layers.seccion['Corredor'] = { color: '#ff0000', width: 1.5, visible: true, type: 'c' };

                // PRE-CÁLCULO DE LÍMITES (OPTIMIZACIÓN CRÍTICA)
                let gMinY = Infinity, gMaxY = -Infinity;
                const pasoScan = raw.secciones.length > 500 ? 5 : 1; // Un poco más detallado para los globales

                raw.secciones.forEach((sec, idx) => {
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

                    const updateBounds = (listas) => {
                        if (!listas) return;
                        listas.forEach(obj => {
                            const arr = Array.isArray(obj) ? obj : (obj.p || []);
                            for (let i = 0; i < arr.length; i += 2) {
                                const x = arr[i], y = arr[i + 1];
                                if (x < minX) minX = x; if (x > maxX) maxX = x;
                                if (y < minY) minY = y; if (y > maxY) maxY = y;
                            }
                        });
                    };
                    updateBounds(sec.t);
                    updateBounds(sec.c);

                    // Guardamos caché
                    if (minX === Infinity) { minX = -10; maxX = 10; minY = 0; maxY = 10; }
                    sec._cach = { minX, maxX, minY, maxY };

                    // Globales (muestreo)
                    if (idx % pasoScan === 0) {
                        if (minY < gMinY) gMinY = minY;
                        if (maxY > gMaxY) gMaxY = maxY;
                    }
                });

                // Si falló el global
                if (gMinY === Infinity) { gMinY = 0; gMaxY = 20; }
                const alto = gMaxY - gMinY;
                appState.limitesGlobales.seccion = { minX: -50, maxX: 50, minY: gMinY - (alto * 0.1), maxY: gMaxY + (alto * 0.1) };
                appState.encuadre.seccion = { minX: -20, maxX: 20, minY: gMinY, maxY: gMaxY };

                const slider = document.getElementById('stationSlider');
                slider.max = appState.secciones.length - 1; slider.value = 0; appState.currentIdx = 0;
                datosCargados = true;
            }

            if (datosCargados) {
                // Reconstruir UI de Ajustes
                buildDynamicSettings();
                resizeAll(); resetView('planta'); resetView('perfil'); resetView('seccion'); syncAllViews();

                // --- CÓDIGO NUEVO: OCULTAR PANTALLA DE BIENVENIDA ---
                const welcomeScreen = document.getElementById('welcome-screen');
                if (welcomeScreen) {
                    welcomeScreen.style.opacity = '0';
                    setTimeout(() => {
                        welcomeScreen.style.display = 'none';
                    }, 500);
                }
                // ----------------------------------------------------

                alert("✅ Archivo TiQAL cargado.");
            } else { alert("⚠️ Archivo sin datos válidos."); }

        } catch (err) { console.error(err); alert("❌ Error al leer archivo."); }
    };
    reader.readAsText(e.target.files[0]);
});

// 4. INTERACCIÓN UNIFICADA (MOUSE/TOUCH)
const canvasSec = document.getElementById('visorCanvas');
const canvasPlanta = document.getElementById('canvasPlanta');
const canvasPerfil = document.getElementById('canvasPerfil');

let isPanning = false;
let distInicial = null;

function getPos(e) {
    return (e.touches && e.touches.length > 0) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
}

function handleStart(e, tipo) {
    const pos = getPos(e);
    appState.lastMousePos = pos;

    // Solo permitimos Paneo/Arrastre si NO estamos usando una herramienta de medición
    if (appState.currentTool === 'none') {
        isPanning = true;
        if (tipo === 'seccion') appState.isDragging = true;
        if (tipo === 'planta' && appState.planta) appState.isDraggingPlanta = true;
        if (tipo === 'perfil' && appState.perfil) appState.isDraggingPerfil = true;
    } else {
        // --- LOGICA DE CLIC EN MEDICIÓN ---
        if (tipo === 'seccion') {
            // FIX: En pantallas táctiles no hay "hover", así que forzamos el cálculo de Snap al tocar
            checkSnapHover(e); // Actualiza appState.snapCandidate si estamos cerca de un punto

            const clickPos = appState.snapCandidate ? appState.snapCandidate :
                { x: ((getPos(e).x - canvasSec.getBoundingClientRect().left) * window.devicePixelRatio - appState.cameras.seccion.x) / appState.cameras.seccion.zoom, y: 0 };
            // Nota: El cálculo 'raw' de arriba es aproximado, mejor usamos lo que ya calcula updateHUD o recalculamos bien.
            // Para consistencia y precisión, re-calcularemos las coordenadas de ingeniería aquí mismo o usamos updateHUD.

            // Recalculamos rx, ry precisos
            const cam = appState.cameras.seccion;
            const rect = canvasSec.getBoundingClientRect();
            const vx = ((pos.x - rect.left) * window.devicePixelRatio - cam.x) / cam.zoom;
            const vy = ((pos.y - rect.top) * window.devicePixelRatio - cam.y) / cam.zoom;
            const rx = ((vx - appState.transform.mx) / appState.transform.scale) + appState.transform.minX;
            const ry = ((canvasSec.height - vy - appState.transform.my) / appState.transform.scale) + appState.transform.minY;

            const finalP = appState.snapCandidate ? { ...appState.snapCandidate } : { x: rx, y: ry };

            if (appState.currentTool === 'point') {
                updateHUD(e); // Comportamiento existente (actualiza lastMarker)
            } else if (appState.currentTool === 'dist' || appState.currentTool === 'slope') {
                // Lógica de 2 pasos
                if (appState.measureP1 && appState.measureP2) {
                    // Click 3: Empezar nueva medición
                    appState.measureP1 = finalP;
                    appState.measureP2 = null;
                } else if (!appState.measureP1) {
                    // Click 1: Primer punto
                    appState.measureP1 = finalP;
                    appState.measureP2 = null;
                } else {
                    // Click 2: Segundo punto (Finalizar)
                    appState.measureP2 = finalP;
                }
                syncAllViews();
                updateInfoHUD(); // Actualizar texto L: ...
            }
        }
    }
}

// Asignar listeners
[{ c: canvasSec, t: 'seccion' }, { c: canvasPlanta, t: 'planta' }, { c: canvasPerfil, t: 'perfil' }].forEach(item => {
    item.c.addEventListener('mousedown', e => handleStart(e, item.t));
    item.c.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            e.preventDefault(); // Evitar eventos de mouse fantasmas (click doble)
            handleStart(e, item.t);
        } else if (e.touches.length === 2) {
            // Guardamos distancia inicial para el pinch zoom
            distInicial = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        }
    }, { passive: false });
});

window.addEventListener('mousemove', handleMove);
window.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && isPanning) {
        if (e.target.tagName === 'CANVAS') e.preventDefault();
        handleMove(e);
    } else if (e.touches.length === 2 && distInicial) {
        e.preventDefault();
        handlePinchZoom(e); // Llama a la función dinámica
    }
}, { passive: false });

function handleMove(e) {
    if (isPanning) {
        const pos = getPos(e);
        const deltaX = (pos.x - appState.lastMousePos.x) * window.devicePixelRatio;
        const deltaY = (pos.y - appState.lastMousePos.y) * window.devicePixelRatio;

        if (appState.isDragging) { appState.cameras.seccion.x += deltaX; appState.cameras.seccion.y += deltaY; }
        if (appState.isDraggingPlanta) { appState.cameras.planta.x += deltaX; appState.cameras.planta.y += deltaY; }
        if (appState.isDraggingPerfil) { appState.cameras.perfil.x += deltaX; appState.cameras.perfil.y += deltaY; }

        appState.lastMousePos = pos;
        syncAllViews();
    } else {
        // Si no estamos paneando, chequear Snap (Hover) en Sección
        checkSnapHover(e);
    }
}

// ZOOM TÁCTIL DINÁMICO (Planta, Perfil y Sección)
function handlePinchZoom(e) {
    let cam = null;
    const targetId = e.target.id;

    // Detectamos qué cámara mover según qué canvas estamos tocando
    if (targetId === 'visorCanvas') cam = appState.cameras.seccion;
    else if (targetId === 'canvasPlanta') cam = appState.cameras.planta;
    else if (targetId === 'canvasPerfil') cam = appState.cameras.perfil;

    if (!cam) return;

    const distActual = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    const delta = distActual / distInicial;
    const oldZoom = cam.zoom;

    // Zoom con límites
    cam.zoom = Math.min(Math.max(cam.zoom * delta, 0.01), 100);

    // Zoom hacia el centro del gesto (Punto medio de los dos dedos)
    const midX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
    const midY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
    const rect = e.target.getBoundingClientRect();
    const ax = (midX - rect.left) * window.devicePixelRatio;
    const ay = (midY - rect.top) * window.devicePixelRatio;

    // Ajuste de paneo para mantener el centro
    cam.x -= (ax - cam.x) * (cam.zoom / oldZoom - 1);
    cam.y -= (ay - cam.y) * (cam.zoom / oldZoom - 1);

    distInicial = distActual;
    syncAllViews();
}

const stopAll = () => { isPanning = false; distInicial = null; appState.isDragging = false; appState.isDraggingPlanta = false; appState.isDraggingPerfil = false; };
window.addEventListener('mouseup', stopAll);
window.addEventListener('touchend', stopAll);

// Zoom Rueda Mouse (Universal)
function aplicarZoom(cam, e, canvasElement) {
    const rect = canvasElement.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * window.devicePixelRatio;
    const mouseY = (e.clientY - rect.top) * window.devicePixelRatio;
    const worldX = (mouseX - cam.x) / cam.zoom;
    const worldY = (mouseY - cam.y) / cam.zoom;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    cam.zoom = Math.min(Math.max(cam.zoom * zoomFactor, 0.001), 100);
    cam.x = mouseX - (worldX * cam.zoom);
    cam.y = mouseY - (worldY * cam.zoom);
    syncAllViews();
}
canvasSec.addEventListener('wheel', e => { e.preventDefault(); aplicarZoom(appState.cameras.seccion, e, canvasSec); }, { passive: false });
canvasPlanta.addEventListener('wheel', e => { e.preventDefault(); aplicarZoom(appState.cameras.planta, e, canvasPlanta); }, { passive: false });
canvasPerfil.addEventListener('wheel', e => { e.preventDefault(); aplicarZoom(appState.cameras.perfil, e, canvasPerfil); }, { passive: false });

// HUD (Sección) - CÁLCULO PRECISO
// HUD (Sección) - CÁLCULO PRECISO Y PERSISTENCIA DE DATOS
function updateHUD(e) {
    if (!appState.secciones || !appState.transform) return;

    const pos = getPos(e);
    const cam = appState.cameras.seccion;
    const rect = canvasSec.getBoundingClientRect();

    // 1. Del Mouse al Canvas (Píxeles visuales)
    const vx = ((pos.x - rect.left) * window.devicePixelRatio - cam.x) / cam.zoom;
    const vy = ((pos.y - rect.top) * window.devicePixelRatio - cam.y) / cam.zoom;

    // 2. Del Canvas a la Ingeniería (Metros reales)
    const rx = ((vx - appState.transform.mx) / appState.transform.scale) + appState.transform.minX;
    const ry = ((canvasSec.height - vy - appState.transform.my) / appState.transform.scale) + appState.transform.minY;

    // Solo actualizamos el marcador si NO es un evento de movimiento (es click) 

    // Si NO estamos midiendo nada, salimos (no actualizamos lastMarker)
    if (appState.currentTool === 'none') return;

    // Si hay un candidato de snap (hover), usámoslo como marcador final
    if (appState.snapCandidate) {
        appState.lastMarker = { ...appState.snapCandidate };
        appState.lastSnappedPoint = { ...appState.snapCandidate }; // Confirmamos snap
    } else {
        // Posición libre del mouse
        appState.lastMarker = { x: rx, y: ry };
        appState.lastSnappedPoint = null;
    }

    syncAllViews();
    updateInfoHUD(); // Forza actualización con el nuevo lastMarker
}

// --- NUEVO: SISTEMA DE MEDICIÓN (DROPDOWN + SNAP INDEPENDIENTE) ---

// 1. Control del Dropdown MEJORADO
function toggleMeasureDropdown(event) {
    if (event) event.stopPropagation(); // Evitar que el click llegue a window
    const dropdown = document.getElementById("measureDropdown");
    dropdown.classList.toggle("show");
}

// Cerrar el dropdown si se hace clic fuera
window.onclick = function (event) {
    if (!event.target.closest('#btnMeasureMenu')) {
        const dropdown = document.getElementById("measureDropdown");
        if (dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    }
}

// 2. TOGGLE ACCIÓN PRINCIPAL (Click en icono)
function toggleMeasureAction() {
    // Si la herramienta actual es 'none', activamos la que esté pre-seleccionada
    if (appState.currentTool === 'none') {
        appState.currentTool = appState.activeToolType;
        // Limpiamos puntos al activar
        appState.measureP1 = null;
        appState.measureP2 = null;
        appState.lastMarker = null; // Limpiar marcador punto anterior
    } else {
        // Si ya hay una activa, la desactivamos
        appState.currentTool = 'none';
        appState.snapCandidate = null;
        appState.measureP1 = null;
        appState.measureP2 = null;
        appState.lastMarker = null;
    }
    updateMeasureUI();
    syncAllViews();
}

// 3. SELECCIONAR HERRAMIENTA DEL MENÚ (Click en dropdown item)
function selectMeasureTool(toolType) {
    appState.activeToolType = toolType;
    // Al seleccionar del menú, también activamos la herramienta automáticamente
    appState.currentTool = toolType;

    // Reset de puntos y marcadores limpieza
    appState.measureP1 = null;
    appState.measureP2 = null;
    appState.lastMarker = null; // CLAVE: Elimar el punto visual anterior

    // Cerrar menú
    document.getElementById("measureDropdown").classList.remove("show");

    updateMeasureUI();
    syncAllViews();
}

// Actualizar UI de los botones
function updateMeasureUI() {
    const btnAction = document.getElementById('btnMeasureAction');
    const optPoint = document.getElementById('opt-point');
    const optDist = document.getElementById('opt-dist');

    // Reset menú items
    if (optPoint) optPoint.classList.remove('active');
    if (optDist) optDist.classList.remove('active');

    // 1. Actualizar Icono Principal y Menú
    if (appState.activeToolType === 'point') {
        btnAction.innerHTML = "📍";
        if (optPoint) optPoint.classList.add('active');
    } else if (appState.activeToolType === 'dist') {
        btnAction.innerHTML = "📏";
        if (optDist) optDist.classList.add('active');
    } else if (appState.activeToolType === 'slope') {
        btnAction.innerHTML = "📉";
        if (document.getElementById('opt-slope')) document.getElementById('opt-slope').classList.add('active');
    }

    // 2. Estado Activo/Inactivo (Color)
    if (appState.currentTool !== 'none') {
        btnAction.classList.add('active');
    } else {
        btnAction.classList.remove('active');
    }
}

// 4. Toggle Snap (Independiente)
function toggleSnap() {
    appState.snapEnabled = !appState.snapEnabled;
    appState.snapCandidate = null;

    const btn = document.getElementById('btnSnap');
    if (btn) {
        if (appState.snapEnabled) btn.classList.add('active');
        else btn.classList.remove('active');
    }
    syncAllViews();
}

// 5. Actualiza el HUD
function updateInfoHUD(mouseX, mouseY) {
    const panel = document.getElementById('hud-panel');
    if (!panel) return;

    if (panel.style.display === 'none') panel.style.display = 'flex';

    // Elementos del DOM
    const infoPoint = document.getElementById('info-point');
    const infoDist = document.getElementById('info-dist');
    const infoSlope = document.getElementById('info-slope');

    // CASO 1: MODO PUNTO (O NINGUNO)
    if (appState.currentTool === 'point' || appState.currentTool === 'none') {
        if (infoDist) infoDist.style.display = 'none';
        if (infoSlope) infoSlope.style.display = 'none';
        if (infoPoint) infoPoint.style.display = 'block';

        // Si es 'none', pero hay lastMarker, lo mostramos. Si no, mostramos 0 o mouse.
        // Pero si es 'none' y no queremos updates de hover, return salvo que sea init.
        if (appState.currentTool === 'none' && mouseX === undefined && !appState.lastMarker) return;
        if (appState.currentTool === 'none' && mouseX !== undefined) return; // Ignorar hover si tool=none

        let curX = mouseX !== undefined ? mouseX : (appState.lastMarker ? appState.lastMarker.x : 0);
        let curY = mouseY !== undefined ? mouseY : (appState.lastMarker ? appState.lastMarker.y : 0);

        // Prioridad visual Snap
        let isSnapped = false;
        if (appState.snapCandidate && appState.currentTool !== 'none') {
            curX = appState.snapCandidate.x;
            curY = appState.snapCandidate.y;
            isSnapped = true;
        }

        const hudX = document.getElementById('hudX');
        const hudY = document.getElementById('hudY');

        if (hudX && hudY) {
            hudX.innerText = curX.toFixed(3);
            hudY.innerText = curY.toFixed(3);
            if (isSnapped) {
                hudX.style.color = '#ffff00'; hudX.style.fontWeight = 'bold';
                hudY.style.color = '#ffff00'; hudY.style.fontWeight = 'bold';
            } else {
                hudX.style.color = ''; hudX.style.fontWeight = 'normal';
                hudY.style.color = ''; hudY.style.fontWeight = 'normal';
            }
        }
        return;
    }

    // CASO 2: MODO DISTANCIA
    if (appState.currentTool === 'dist') {
        if (infoPoint) infoPoint.style.display = 'none';
        if (infoSlope) infoSlope.style.display = 'none';
        if (infoDist) infoDist.style.display = 'block';

        const distP1 = document.getElementById('distP1');
        const distP2 = document.getElementById('distP2');
        const distVal = document.getElementById('distVal');

        // P1
        if (appState.measureP1) {
            distP1.innerText = `X=${appState.measureP1.x.toFixed(3)} │ Z=${appState.measureP1.y.toFixed(3)}`;
        } else {
            distP1.innerText = "X=-- │ Z=--";
        }

        // P2 (Actual)
        let p2 = appState.measureP2;
        let isSnapped = false;
        // Si no hay P2 fijo, usamos el mouse/snap actual
        if (!p2) {
            if (appState.snapCandidate) {
                p2 = appState.snapCandidate;
                isSnapped = true;
            } else if (mouseX !== undefined) {
                p2 = { x: mouseX, y: mouseY };
            } else if (appState.lastMarker) {
                // Fallback
                p2 = appState.lastMarker;
            }
        }

        if (p2) {
            distP2.innerText = `X=${p2.x.toFixed(3)} │ Z=${p2.y.toFixed(3)}`;
            if (isSnapped) distP2.style.color = '#ffff00';
            else distP2.style.color = '';

            // Calc Distancia
            if (appState.measureP1) {
                const d = Math.hypot(p2.x - appState.measureP1.x, p2.y - appState.measureP1.y);
                distVal.innerText = `${d.toFixed(3)}m`;
            } else {
                distVal.innerText = "0.000m";
            }
        } else {
            distP2.innerText = "X=-- │ Z=--";
            distVal.innerText = "--";
        }
    }

    // CASO 3: MODO PENDIENTE
    if (appState.currentTool === 'slope') {
        if (infoPoint) infoPoint.style.display = 'none';
        if (infoDist) infoDist.style.display = 'none';
        if (infoSlope) infoSlope.style.display = 'block';

        const slopeP1 = document.getElementById('slopeP1');
        const slopeP2 = document.getElementById('slopeP2');
        const slopeVal = document.getElementById('slopeVal');
        const slopeRatio = document.getElementById('slopeRatio');
        const slopeH = document.getElementById('slopeH');
        const slopeV = document.getElementById('slopeV');
        const slopeReal = document.getElementById('slopeReal');

        // P1
        if (appState.measureP1) {
            slopeP1.innerText = `X=${appState.measureP1.x.toFixed(3)} │ Z=${appState.measureP1.y.toFixed(3)}`;
        } else {
            slopeP1.innerText = "X=-- │ Z=--";
        }

        // P2 (Actual)
        let p2 = appState.measureP2;
        // Si no hay P2 fijo, usamos el mouse/snap actual
        if (!p2) {
            if (appState.snapCandidate) {
                p2 = appState.snapCandidate;
            } else if (mouseX !== undefined) {
                p2 = { x: mouseX, y: mouseY };
            } else if (appState.lastMarker) {
                p2 = appState.lastMarker;
            }
        }

        if (p2) {
            slopeP2.innerText = `X=${p2.x.toFixed(3)} │ Z=${p2.y.toFixed(3)}`;

            // CÁLCULOS
            if (appState.measureP1) {
                const dx = Math.abs(p2.x - appState.measureP1.x);
                const dy = Math.abs(p2.y - appState.measureP1.y); // Diferencia de altura (dZ realmente)
                const real = Math.hypot(dx, dy);

                // Pendiente %
                let pct = 0;
                if (dx !== 0) {
                    pct = (dy / dx) * 100;
                } else {
                    pct = 9999.9; // Infinito vertical
                }

                // Talud H:V (X:1)
                let taludStr = "--:1";
                if (dy !== 0) {
                    const ratio = dx / dy;
                    taludStr = `${ratio.toFixed(2)}:1`;
                } else {
                    taludStr = "∞:0"; // Plano
                }

                slopeVal.innerText = `${pct.toFixed(2)}%`;
                slopeRatio.innerText = taludStr;
                slopeH.innerText = dx.toFixed(2);
                slopeV.innerText = dy.toFixed(2);
                slopeReal.innerText = real.toFixed(3);

            } else {
                slopeVal.innerText = "0.0%"; slopeRatio.innerText = "--:1";
                slopeH.innerText = "0.00"; slopeV.innerText = "0.00"; slopeReal.innerText = "0.00";
            }
        } else {
            slopeP2.innerText = "X=-- │ Z=--";
        }
    }
}

// Inicializar HUD al cargar
window.addEventListener('load', () => {
    // Estado inicial
    appState.currentTool = 'none';
    appState.activeToolType = 'point'; // Por defecto
    updateMeasureUI();
});

// --- CÁLCULO DE SNAP AL MOVER MOUSE (HOVER) ---
function checkSnapHover(e) {
    if (!appState.secciones || !appState.secciones[appState.currentIdx]) return;

    const cam = appState.cameras.seccion;
    const rect = canvasSec.getBoundingClientRect();
    const pos = getPos(e);

    // Si el mouse no está sobre el canvas de sección, limpiar
    if (pos.x < rect.left || pos.x > rect.right || pos.y < rect.top || pos.y > rect.bottom) {
        if (appState.snapCandidate) { appState.snapCandidate = null; syncAllViews(); }
        return;
    }

    const vx = ((pos.x - rect.left) * window.devicePixelRatio - cam.x) / cam.zoom;
    const vy = ((pos.y - rect.top) * window.devicePixelRatio - cam.y) / cam.zoom;
    const rx = ((vx - appState.transform.mx) / appState.transform.scale) + appState.transform.minX;
    const ry = ((canvasSec.height - vy - appState.transform.my) / appState.transform.scale) + appState.transform.minY;

    // Si NO hay herramienta activa, salimos (ni snap ni update HUD)
    if (appState.currentTool === 'none') {
        return;
    }

    // Guardamos la posición actual del cursor (para el rubberband de distancia)
    // ESTO DEBE HACERSE SIEMPRE, incluso si el Snap está desactivado
    appState.currentCursorPos = { x: rx, y: ry };

    // Si es herramienta DISTANCIA o PENDIENTE:
    // 1. Actualizar HUD
    // 2. Si estamos en mitad de medición (P1 definido), forzar Redraw para ver la línea elástica
    if (appState.currentTool === 'dist' || appState.currentTool === 'slope') {
        updateInfoHUD(rx, ry);
        if (appState.measureP1) {
            syncAllViews();
        }
    }

    // Si Snap NO está activo, salimos (ya actualizamos HUD arriba si era dist)
    if (!appState.snapEnabled) {
        if (appState.snapCandidate) { appState.snapCandidate = null; syncAllViews(); }
        return;
    }

    const currentSec = appState.secciones[appState.currentIdx];
    const snapDistPx = 15;
    const snapDistWorld = snapDistPx / cam.zoom / appState.transform.scale;

    let bestDist = Infinity;
    let candidate = null;

    const checkPoints = (list) => {
        if (!list) return;
        list.forEach(obj => {
            const arr = Array.isArray(obj) ? obj : (obj.p || []);
            for (let i = 0; i < arr.length; i += 2) {
                const px = arr[i], py = arr[i + 1];
                const dist = Math.hypot(px - rx, py - ry);
                if (dist < snapDistWorld && dist < bestDist) {
                    bestDist = dist;
                    candidate = { x: px, y: py };
                }
            }
        });
    };
    checkPoints(currentSec.t);
    checkPoints(currentSec.c);

    // Actualizar estado solo si cambió
    const prevCandidate = appState.snapCandidate;
    appState.snapCandidate = candidate;

    // Solo redibujamos si cambia el candidato visual (cuadrado amarillo) O si estamos midiendo distancia/pendiente
    // Nota: El redraw de distancia ya lo forzamos arriba si era necesario, pero por si acaso cambia el snap:
    if (candidate || prevCandidate) {
        syncAllViews();
        if (appState.currentTool === 'dist' || appState.currentTool === 'slope') updateInfoHUD(rx, ry);
    }
}

// SLIDER Y BUSQUEDA
document.getElementById('stationSlider').addEventListener('input', (e) => {
    appState.currentIdx = parseInt(e.target.value);
    syncAllViews();
});
const kmInput = document.getElementById('kmInput');
kmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { buscarProgresiva(kmInput.value); kmInput.blur(); }
});
function buscarProgresiva(texto) {
    if (!appState.secciones) return;
    let valorBuscado = parseFloat(texto.replace('+', ''));
    if (isNaN(valorBuscado)) { syncAllViews(); return; }
    let mejorIndice = 0; let minimaDiferencia = Infinity;
    appState.secciones.forEach((seccion, index) => {
        let kActual = seccion.k || seccion.km || 0;
        let diferencia = Math.abs(kActual - valorBuscado);
        if (diferencia < minimaDiferencia) { minimaDiferencia = diferencia; mejorIndice = index; }
    });
    appState.currentIdx = mejorIndice;
    document.getElementById('stationSlider').value = mejorIndice;
    syncAllViews();
}

// RESIZE
function resizeAll() {
    ['visorCanvas', 'canvasPlanta', 'canvasPerfil'].forEach(id => {
        const c = document.getElementById(id);
        if (c && c.parentNode) {
            const parent = c.parentNode;
            if (parent.clientWidth > 0) {
                c.width = parent.clientWidth * window.devicePixelRatio;
                c.height = parent.clientHeight * window.devicePixelRatio;
            }
        }
    });
    syncAllViews();
}
function resetView(tipo) {
    if (appState.cameras[tipo]) { appState.cameras[tipo] = { x: 0, y: 0, zoom: 1 }; syncAllViews(); }
}
const observerPlanta = new ResizeObserver(entries => {
    for (let entry of entries) { if (entry.contentRect.width > 10) { resizeAll(); syncAllViews(); } }
});
if (document.getElementById('panel-planta')) observerPlanta.observe(document.getElementById('panel-planta'));

window.onload = resizeAll;
window.onresize = resizeAll;

// AJUSTES
function openTab(tabId) {
    // 1. Ocultar todos los contenidos
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

    // 2. Desactivar todos los botones
    document.querySelectorAll('.setting-tab').forEach(el => el.classList.remove('active'));

    // 3. Activar contenido seleccionado
    const target = document.getElementById(tabId);
    if (target) {
        target.classList.add('active');
    }

    // 4. Activar botón correspondiente (Mapeo directo)
    const map = {
        'tab-general': 0,
        'tab-planta': 1,
        'tab-perfil': 2,
        'tab-seccion': 3,
        'tab-multi': 4
    };

    const buttons = document.querySelectorAll('.setting-tab');
    const index = map[tabId];
    if (index !== undefined && buttons[index]) {
        buttons[index].classList.add('active');
    }
}

// ==========================================================================
// NUEVO: LÓGICA DE AUTO-ENCUADRE INTELIGENTE
// ==========================================================================
function actualizarEncuadreInteligente(pkActual) {
    // 1. Validaciones básicas
    const dashboard = document.getElementById('main-dashboard');
    const esMulti = dashboard && dashboard.classList.contains('layout-multi');
    const autoZoom = appConfig.multi && appConfig.multi.autoZoom;

    // Si no estamos en multivista o está desactivado, salimos
    if (!esMulti || !autoZoom) return;

    // 2. Calcular Ventana (Windowing)
    // Ejemplo: PK 1+500, Ventana 1 -> Start: 1000, End: 2000
    // Ejemplo: PK 1+500, Ventana 2 -> Start: 0, End: 3000
    const windowKm = appConfig.multi.windowSize || 1; // Default 1km

    // Parte entera del kilometraje actual
    const kCurrent = Math.floor(pkActual / 1000);

    // Rango de Kilometros ENTEROS
    const kStart = Math.max(0, kCurrent - (windowKm - 1)); // Si estoy en 1, quiero ver desde 0
    const kEnd = kCurrent + windowKm;

    const mStart = kStart * 1000;
    const mEnd = (kEnd * 1000) + 1000; // Hasta el final del km

    // *OPTIMIZACIÓN*: Si la ventana calculada es IGUAL a la actual, NO HACEMOS NADA
    // Esto evita re-renderizados o movimientos innecesarios
    if (appState.lastAutoWindow &&
        appState.lastAutoWindow.start === mStart &&
        appState.lastAutoWindow.end === mEnd) {
        return;
    }

    // Guardamos estado para la próxima comparación
    appState.lastAutoWindow = { start: mStart, end: mEnd };

    // 3. Aplicar a Perfil
    if (appState.perfil) {
        const pCam = appState.cameras.perfil;
        const canvas = document.getElementById('canvasPerfil');

        // Calcular límites verticales (Z) dentro de este rango K
        let localMinZ = Infinity, localMaxZ = -Infinity;
        appState.perfil.forEach(p => {
            if (!p.visible && (appConfig.layers.perfil[p.nombre] && !appConfig.layers.perfil[p.nombre].visible)) return;
            if (p.data) p.data.forEach(pt => {
                if (pt[0] >= mStart && pt[0] <= mEnd) {
                    if (pt[1] < localMinZ) localMinZ = pt[1];
                    if (pt[1] > localMaxZ) localMaxZ = pt[1];
                }
            });
        });

        if (localMinZ !== Infinity && canvas) {
            // Padding
            const padZ = (localMaxZ - localMinZ) * 0.2;
            const targetMinZ = localMinZ - padZ;
            const targetMaxZ = localMaxZ + padZ;

            // Ajustar Zoom para que quepe (Fit)
            // Scale = W / (RangeK * 1.1)
            const W = canvas.width / window.devicePixelRatio;
            const H = canvas.height / window.devicePixelRatio;

            const exaj = appConfig.perfil.exaj || 10;
            const rangeK = mEnd - mStart;
            const rangeZ = (targetMaxZ - targetMinZ) * exaj;

            // Zoom ideal para encajar TODO el cuadro
            const newZoom = Math.min(W / (rangeK * 1.05), H / (rangeZ * 1.05));

            // Posicionar Cámara
            const centroK = (mStart + mEnd) / 2;
            const centroZ = (targetMinZ + targetMaxZ) / 2;

            // Fórmula inversa de toX/toY en perfil.js:
            // toX = (W/2) + (k - centroKGlobal) * scale * zoom + camX
            // Queremos que (k - centroKGlobal) se anule o se centre. 
            // SIMPLIFICACIÓN: Reseteamos la cámara "lógica" y movemos el offset.
            // Mejor enfoque: Calcular x/y para centrar centroK/centroZ en pantalla W/2, H/2

            // PERO... perfil.js usa appState.encuadre.perfil como base (0,0).
            // Entonces:
            const { minK, maxK, minZ, maxZ } = appState.encuadre.perfil;
            const globalCenterK = (minK + maxK) / 2;
            const globalCenterZ = (minZ + maxZ) / 2;

            // El desplazamiento necesario (en píxeles de mundo escalado)
            // offsetK = (globalCenterK - centroKObjetivo) * scaleBase * newZoom
            // No... es más fácil:
            // cam.x = (centerScreenX) - toX_World(centroKObjetivo)
            // toX_World = (W/2) + (centroKObjetivo - globalCenterK) * scaleBase * newZoom... 
            // Es complejo porque la escala base depende del encuadre global inicial.

            // HACK EFECTIVO:
            // Modificamos, NO la cámara (x,y), sino el ENCUADRE GLOBAL momentáneamente? NO, eso rompe todo.
            // Modificamos x,y,zoom.

            // Vamos a re-calcular Scale BASE (el que usa perfil.js)
            const rangeK_G = maxK - minK;
            const rangeZ_G = (maxZ - minZ) * exaj;
            const scaleBase = Math.min(W / (rangeK_G * 1.1), H / (rangeZ_G * 1.1));

            // Set Zoom
            pCam.zoom = newZoom / scaleBase;

            // Set X/Y
            // Queremos que al dibujar toX(centroK), caiga en W/2.
            // toX_code = (W/2) + (k - globalCenterK) * scaleBase
            // draw_x = (toX_code * zoom) + camX
            // ( (W/2) + (centroK - globalCenterK)*scaleBase ) * zoom + camX = W/2
            // Simplificando (asumiendo zoom aplica a todo, en perfil.js apply translate then scale):
            // ctx.translate(cam.x, cam.y); ctx.scale(cam.zoom, ...); 
            // toX devuelve pos local sin zoom.
            // (toX(centroK) * zoom) + camX = W*zoom/2 ?? NO.
            // perfil.js: translate(camX, camY) -> scale(zoom) -> draw(toX(k))
            // ScreenX = (toX(k) * zoom) + camX
            // Queremos ScreenX = W/2 (centro pantalla)
            // ( (W/2 + (centroK - globalCenterK)*scaleBase) * zoom ) + camX = W/2/window.devicePixelRatio... OJO con DPI.
            // W en perfil.js es canvas.width (con DPI). Aquí W es CSS width.
            // Usamos coordenadas de perfil.js lógicas.

            // Recálculo seguro:
            const W_real = canvas.width;
            const H_real = canvas.height;
            const scaleBase_real = Math.min(W_real / (rangeK_G * 1.1), H_real / (rangeZ_G * 1.1));

            const toX_local = (k) => (W_real / 2) + (k - globalCenterK) * scaleBase_real;
            const toY_local = (z) => (H_real / 2) - (z - globalCenterZ) * exaj * scaleBase_real;

            const targetX_local = toX_local(centroK);
            const targetY_local = toY_local(centroZ);

            // screenX = targetX_local * zoom + camX
            // Queremos screenX = W_real / 2
            // camX = (W_real / 2) - (targetX_local * zoom)

            pCam.zoom = (Math.min(W_real / (rangeK * 1.05), H_real / (rangeZ * 1.05))) / scaleBase_real;
            pCam.x = (W_real / 2) - (targetX_local * pCam.zoom);
            pCam.y = (H_real / 2) - (targetY_local * pCam.zoom);
        }
    }

    // 4. Aplicar a Planta
    if (appState.planta) {
        const plCam = appState.cameras.planta;
        const canvas = document.getElementById('canvasPlanta');

        // Necesitamos bounding box del eje en ese rango PK
        const trazo = appState.planta.planta_trazo || appState.planta.geometria || [];
        let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
        let found = false;

        // Iteramos puntos
        // Asume formato [pk, e, n] o [e, n]
        // Si no tiene PK, no podemos filtrar bien, usamos todo (fallback)
        // Pero VisorCivilPro suele usar [k, x, y]
        const es3 = (trazo[0] && trazo[0].length === 3);

        if (es3) {
            trazo.forEach(pt => {
                const k = pt[0], e = pt[1], n = pt[2];
                if (k >= mStart && k <= mEnd) {
                    if (e < minE) minE = e; if (e > maxE) maxE = e;
                    if (n < minN) minN = n; if (n > maxN) maxN = n;
                    found = true;
                }
            });
        }

        // Si encontramos puntos en ese rango
        if (found && canvas) {
            // Lógica idéntica al perfil
            const W_real = canvas.width;
            const H_real = canvas.height;
            const { minE: gMinE, maxE: gMaxE, minN: gMinN, maxN: gMaxN } = appState.encuadre.planta;

            const gCenterE = (gMinE + gMaxE) / 2;
            const gCenterN = (gMinN + gMaxN) / 2;

            const scaleBase_real = Math.min(W_real / ((gMaxE - gMinE) * 1.2), H_real / ((gMaxN - gMinN) * 1.2));

            const padding = 50; // Metros de aire
            const targetW = (maxE - minE) + padding;
            const targetH = (maxN - minN) + padding;

            const targetMinE = minE - padding / 2;
            const targetMaxE = maxE + padding / 2;
            const targetMinN = minN - padding / 2;
            const targetMaxN = maxN + padding / 2;

            const centroE = (targetMinE + targetMaxE) / 2;
            const centroN = (targetMinN + targetMaxN) / 2;

            // Zoom necesario
            // newZoomAbs = Math.min(W / widthMundo, H / heightMundo)
            const zoomAbs = Math.min(W_real / targetW, H_real / targetH);

            // Factor relativo a la base
            plCam.zoom = zoomAbs / scaleBase_real;

            // Centrado
            const toX_local = (e) => (W_real / 2) + (e - gCenterE) * scaleBase_real;
            const toY_local = (n) => (H_real / 2) - (n - gCenterN) * scaleBase_real;

            const targetX_local = toX_local(centroE);
            const targetY_local = toY_local(centroN);

            plCam.x = (W_real / 2) - (targetX_local * plCam.zoom);
            plCam.y = (H_real / 2) - (targetY_local * plCam.zoom);
        }
    }
}

// ==========================================================================
// NUEVO: GENERADOR DE INTERFAZ DE CAPAS
// ==========================================================================

function buildDynamicSettings() {
    // 1. Planta
    const divPlanta = document.getElementById('layers-planta-container');
    divPlanta.innerHTML = '';
    Object.keys(appConfig.layers.planta).forEach(key => {
        divPlanta.appendChild(createLayerControl('planta', key));
    });

    // 2. Perfil
    const divPerfil = document.getElementById('layers-perfil-container');
    const selTarget = document.getElementById('cfgTargetPerfil');
    divPerfil.innerHTML = '';
    selTarget.innerHTML = '<option value="auto">Automático (Primer Elemento)</option>'; // Reset

    Object.keys(appConfig.layers.perfil).forEach(key => {
        divPerfil.appendChild(createLayerControl('perfil', key));
        // Agregar al selector de rastreo
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = key;
        selTarget.appendChild(opt);
    });

    // 3. Sección
    const divSeccion = document.getElementById('layers-seccion-container');
    divSeccion.innerHTML = '';
    Object.keys(appConfig.layers.seccion).forEach(key => {
        divSeccion.appendChild(createLayerControl('seccion', key));
    });
}

function createLayerControl(viewType, layerName) {
    const layer = appConfig.layers[viewType][layerName];

    const row = document.createElement('div');
    row.className = 'setting-row';
    row.style.borderBottom = '1px solid var(--border)';
    row.style.paddingBottom = '5px';

    // Checkbox Visibilidad
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = layer.visible;
    check.onchange = (e) => { layer.visible = e.target.checked; syncAllViews(); };

    // Nombre
    const span = document.createElement('span');
    span.innerText = layerName;
    span.style.flexGrow = 1;
    span.style.marginLeft = '10px';
    span.style.fontSize = '12px';

    // Color Picker
    const color = document.createElement('input');
    color.type = 'color';
    color.value = layer.color;
    color.style.border = 'none';
    color.style.width = '25px';
    color.style.height = '25px';
    color.style.background = 'none';
    color.onchange = (e) => { layer.color = e.target.value; syncAllViews(); };

    // Grosor (Input number pequeño)
    const width = document.createElement('input');
    width.type = 'number';
    width.value = layer.width;
    width.step = 0.5;
    width.min = 0.1;
    width.style.width = '40px';
    width.className = 'input-number';
    width.onchange = (e) => { layer.width = parseFloat(e.target.value); syncAllViews(); };

    row.appendChild(check);
    row.appendChild(span);
    row.appendChild(color);
    row.appendChild(width);

    return row;
}

function toggleSettings() {
    const m = document.getElementById('settingsModal');
    if (!m) return;

    // Lógica simple de alternar
    const isHidden = m.style.display === 'none';
    m.style.display = isHidden ? 'flex' : 'none';

    // Animación botón engranaje
    const btnSettings = document.querySelector('.btn-settings');
    if (btnSettings) {
        isHidden ? btnSettings.classList.add('active') : btnSettings.classList.remove('active');
    }

    // Si se está abriendo, cargamos los valores actuales a los inputs
    if (isHidden) cargarValoresAjustes();
}

function cargarValoresAjustes() {
    // 1. General
    document.getElementById('chkTheme').checked = (appConfig.general.theme === 'light');
    document.getElementById('cfgTextScale').value = appConfig.general.textScale;

    // 2. Planta
    document.getElementById('cfgGridPlanta').value = appConfig.planta.gridInterval;
    document.getElementById('cfgGridPlantaMulti').value = appConfig.planta.gridIntervalMulti;
    document.getElementById('chkShowGridPlanta').checked = appConfig.planta.showGrid;

    // --- NUEVO: Ticks y Etiquetas ---
    document.getElementById('cfgPlantaMajor').value = appConfig.planta.ticksMajor || 1000;
    document.getElementById('cfgPlantaMinor').value = appConfig.planta.ticksMinor || 100;
    document.getElementById('chkPlantaLabels').checked = appConfig.planta.showLabels !== false;
    document.getElementById('chkPlantaTicks').checked = appConfig.planta.showTicks !== false;

    // 2.1 Multi-Vista
    if (appConfig.multi) {
        document.getElementById('chkMultiAutoZoom').checked = appConfig.multi.autoZoom !== false;
        document.getElementById('cfgMultiWindow').value = appConfig.multi.windowSize || 2;
    }

    // 3. Perfil
    document.getElementById('cfgGridPerfilK').value = appConfig.perfil.gridK;
    document.getElementById('cfgGridPerfilKMulti').value = appConfig.perfil.gridKMulti || 1000;
    document.getElementById('cfgGridPerfilZ').value = appConfig.perfil.gridZ;
    document.getElementById('cfgGridPerfilZMulti').value = appConfig.perfil.gridZMulti || 50;
    document.getElementById('cfgExajPerfil').value = appConfig.perfil.exaj;
    document.getElementById('cfgTargetPerfil').value = appConfig.perfil.target;

    // 4. Sección
    document.getElementById('cfgGridSeccionX').value = (appConfig.seccion && appConfig.seccion.gridX) ? appConfig.seccion.gridX : 5;
    document.getElementById('cfgGridSeccionY').value = (appConfig.seccion && appConfig.seccion.gridY) ? appConfig.seccion.gridY : 5;
}

function applySettingsAndClose() {
    // Guardar General
    appConfig.general.textScale = parseFloat(document.getElementById('cfgTextScale').value) || 1.0;

    // Guardar Planta
    if (!appConfig.planta) appConfig.planta = {};
    appConfig.planta.gridInterval = parseFloat(document.getElementById('cfgGridPlanta').value) || 200;
    appConfig.planta.gridIntervalMulti = parseFloat(document.getElementById('cfgGridPlantaMulti').value) || 500;
    appConfig.planta.showGrid = document.getElementById('chkShowGridPlanta').checked;

    // --- NUEVO: Guardar Ticks ---
    appConfig.planta.ticksMajor = parseFloat(document.getElementById('cfgPlantaMajor').value) || 1000;
    appConfig.planta.ticksMinor = parseFloat(document.getElementById('cfgPlantaMinor').value) || 100;
    appConfig.planta.showLabels = document.getElementById('chkPlantaLabels').checked;
    appConfig.planta.showTicks = document.getElementById('chkPlantaTicks').checked;

    // Guardar Multi-Vista
    if (!appConfig.multi) appConfig.multi = {};
    appConfig.multi.autoZoom = document.getElementById('chkMultiAutoZoom').checked;
    appConfig.multi.windowSize = parseInt(document.getElementById('cfgMultiWindow').value) || 2;

    // Guardar Perfil
    if (!appConfig.perfil) appConfig.perfil = {};
    appConfig.perfil.gridK = parseFloat(document.getElementById('cfgGridPerfilK').value) || 100;
    appConfig.perfil.gridKMulti = parseFloat(document.getElementById('cfgGridPerfilKMulti').value) || 1000;
    appConfig.perfil.gridZ = parseFloat(document.getElementById('cfgGridPerfilZ').value) || 5;
    appConfig.perfil.gridZMulti = parseFloat(document.getElementById('cfgGridPerfilZMulti').value) || 50;
    appConfig.perfil.exaj = parseFloat(document.getElementById('cfgExajPerfil').value) || 10;
    appConfig.perfil.target = document.getElementById('cfgTargetPerfil').value;

    // Guardar Sección
    if (!appConfig.seccion) appConfig.seccion = {};
    appConfig.seccion.gridX = parseFloat(document.getElementById('cfgGridSeccionX').value) || 5;
    appConfig.seccion.gridY = parseFloat(document.getElementById('cfgGridSeccionY').value) || 5;

    // Aplicar cambios
    syncAllViews();

    // Cerrar ventana correctamente (Solución del bug)
    toggleSettings();
}

function toggleTheme(checkbox) { appConfig.general.theme = checkbox.checked ? 'light' : 'dark'; applyTheme(); }
function applyTheme() {
    if (appConfig.general.theme === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    syncAllViews();
}
window.addEventListener('DOMContentLoaded', () => { applyTheme(); });


// ============================================================
// SISTEMA DE CAPTURA DE IMAGEN (REPORTES HD) - FINAL
// ============================================================

// 1. CEREBRO: DECIDE QUÉ CAPTURAR Y PONE EL TÍTULO CORRECTO
// ============================================================
// SISTEMA DE GENERACIÓN DE PLANOS (Blueprint Engine)
// ============================================================

// 1. DESPACHADOR PRINCIPAL
function capturaInteligente() {
    const dashboard = document.getElementById('main-dashboard');
    const layout = dashboard.className;

    if (layout === 'layout-multi') {
        // En multi-vista, pasamos null como canvas fuente, la función interna se encargará
        generarPlanoIngenieria(null, "Multi-Vista General", true);
    } else {
        let activeCanvasId = '';
        let activeTitle = '';

        if (layout.includes('planta')) {
            activeCanvasId = 'canvasPlanta';
            activeTitle = 'PLANTA GENERAL';
        } else if (layout.includes('perfil')) {
            activeCanvasId = 'canvasPerfil';
            activeTitle = 'PERFIL LONGITUDINAL';
        } else {
            activeCanvasId = 'visorCanvas';
            activeTitle = 'SECCIÓN TRANSVERSAL';
        }

        const canvas = document.getElementById(activeCanvasId);
        if (canvas) {
            generarPlanoIngenieria(canvas, activeTitle, false);
        } else {
            alert("⚠️ No se detectó una vista activa para exportar.");
        }
    }
}

// 2. MOTOR DE RENDERIZADO (Estilo CAD)
function generarPlanoIngenieria(sourceCanvas, tituloVista, isMulti) {
    // Configuración Hoja (HD Landscape)
    // Configuración Hoja (4K UHD Landscape)
    const SCALE = 2; // 1 = 1080p, 2 = 2160p (4K)

    const W = 1920 * SCALE;
    const H = 1080 * SCALE;

    // Márgenes (Cajetín)
    const mOut = 20 * SCALE;
    const mIn = 10 * SCALE;

    // Alturas Áreas
    const hHeader = 70 * SCALE;
    const hFooter = 60 * SCALE;

    // Crear Canvas en Memoria
    const sheet = document.createElement('canvas');
    sheet.width = W;
    sheet.height = H;
    const ctx = sheet.getContext('2d');

    // ----------------------------------------------------
    // A. FONDO Y MARCO (ESTILO PLANO)
    // ----------------------------------------------------
    // 1. Fondo Papel (Siempre Blanco)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // 2. Marco Negro Exterior
    ctx.lineWidth = 3 * SCALE;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(mOut, mOut, W - (mOut * 2), H - (mOut * 2));

    // 3. Líneas Divisorias (Header y Footer)
    ctx.beginPath();
    // Línea bajo Header
    const yHeaderLine = mOut + hHeader;
    ctx.moveTo(mOut, yHeaderLine);
    ctx.lineTo(W - mOut, yHeaderLine);
    // Línea sobre Footer
    const yFooterLine = H - mOut - hFooter;
    ctx.moveTo(mOut, yFooterLine);
    ctx.lineTo(W - mOut, yFooterLine);
    ctx.stroke();

    // ----------------------------------------------------
    // B. ENCABEZADO (HEADER)
    // ----------------------------------------------------
    // Logo (Texto Simulado o Imagen si existiera)
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${32 * SCALE}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText("TiQAL", mOut + (30 * SCALE), mOut + (hHeader / 2) - (10 * SCALE));

    // Subtítulo pequeño bajo el logo
    ctx.fillStyle = '#666666'; // Gris tenue
    ctx.font = `${14 * SCALE}px Arial`;
    ctx.fillText("Ticona Q. Alexander", mOut + (30 * SCALE), mOut + (hHeader / 2) + (15 * SCALE));

    // Título Central (Grande)
    ctx.font = `bold ${40 * SCALE}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(tituloVista, W / 2, mOut + (hHeader / 2));

    // Fecha (Derecha)
    const now = new Date();
    const fecha = now.toLocaleDateString();

    ctx.textAlign = 'right';
    ctx.font = `bold ${16 * SCALE}px Arial`;
    ctx.fillText(fecha, W - mOut - (30 * SCALE), mOut + (hHeader / 2));

    // ----------------------------------------------------
    // C. CONTENIDO (VIEWPORT)
    // ----------------------------------------------------
    // Área disponible para dibujo
    const viewX = mOut + mIn;
    const viewY = yHeaderLine + mIn;
    const viewW = W - (mOut * 2) - (mIn * 2);
    const viewH = yFooterLine - yHeaderLine - (mIn * 2);

    // Recuadro fino alrededor del dibujo
    ctx.lineWidth = 1 * SCALE;
    ctx.strokeStyle = '#333333';
    ctx.strokeRect(viewX, viewY, viewW, viewH);

    // Recorte (Clip) para que nada se salga del marco
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewX, viewY, viewW, viewH);
    ctx.clip();

    // DIBUJADO INTELIGENTE (INVERSIÓN DE COLOR SI ES NECESARIO)
    const isDarkMode = !document.body.classList.contains('light-mode');

    if (isDarkMode) {
        // Truco Maestro: Invertir luminosidad pero preservar tono (aprox)
        // O simple inversión para alto contraste en plano
        ctx.filter = 'invert(1) hue-rotate(180deg) contrast(1.2)';
    }

    if (isMulti) {
        // Lógica Multi-Vista (Dibujar 3 paneles en grilla dentro del viewW/viewH)
        // CSS Grid:
        // Planta: Col 1, Row 1 (Top Left)
        // Perfil: Col 1, Row 2 (Bottom Left)
        // Sección: Col 2, Row 1-2 (Right Full)
        const items = [
            { id: 'canvasPlanta', x: 0, y: 0, w: 0.5, h: 0.5, label: 'PLANTA' },
            { id: 'canvasPerfil', x: 0, y: 0.5, w: 0.5, h: 0.5, label: 'PERFIL' },
            { id: 'visorCanvas', x: 0.5, y: 0, w: 0.5, h: 1, label: 'SECCIÓN' }
        ];

        items.forEach(item => {
            const c = document.getElementById(item.id);
            if (c) {
                const ix = viewX + (item.x * viewW);
                const iy = viewY + (item.y * viewH);
                const iw = item.w * viewW;
                const ih = item.h * viewH;

                // Dibujar imagen ajustada (cover/contain approach simple)
                // Aquí estiramos para llenar la celda asignada, o podríamos mantener ratio con bandas blancas
                ctx.drawImage(c, 0, 0, c.width, c.height, ix, iy, iw, ih);

                // Marco interno de celda
                ctx.strokeStyle = '#999';
                ctx.strokeRect(ix, iy, iw, ih);

                // Etiqueta de celda
                ctx.save();
                ctx.filter = 'none';
                ctx.fillStyle = '#000';
                ctx.font = `bold ${14 * SCALE}px Arial`;
                ctx.textAlign = 'left';
                ctx.fillText(item.label, ix + (10 * SCALE), iy + (20 * SCALE));
                ctx.restore();
            }
        });

    } else {
        // Lógica Vista Única (Fit Center)
        if (sourceCanvas) {
            // Calcular ratio para "contain" (encajar sin deformar)
            const ratioSrc = sourceCanvas.width / sourceCanvas.height;
            const ratioDest = viewW / viewH;

            let finalW, finalH, offX, offY;

            if (ratioSrc > ratioDest) {
                // Más ancho que el destino
                finalW = viewW;
                finalH = viewW / ratioSrc;
                offX = 0;
                offY = (viewH - finalH) / 2;
            } else {
                // Más alto que el destino
                finalH = viewH;
                finalW = viewH * ratioSrc;
                offX = (viewW - finalW) / 2;
                offY = 0;
            }

            ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, viewX + offX, viewY + offY, finalW, finalH);

            // Si es Planta, dibujar Flecha Norte (siempre visible)
            if (tituloVista.includes('PLANTA')) {
                // Dibujar una "N" simple en la esquina
                ctx.save();
                ctx.filter = 'none'; // Sin filtro para el símbolo norte nuevo
                ctx.translate(viewX + viewW - (50 * SCALE), viewY + (50 * SCALE));
                ctx.fillStyle = '#000';
                ctx.font = `bold ${24 * SCALE}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText("N", 0, (10 * SCALE));
                // Flecha
                ctx.beginPath();
                ctx.moveTo(0, (-20 * SCALE));
                ctx.lineTo((-10 * SCALE), 0);
                ctx.lineTo((10 * SCALE), 0);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    ctx.restore(); // Restaurar filtro y clip

    // ----------------------------------------------------
    // D. PIE DE PÁGINA (FOOTER)
    // ----------------------------------------------------
    const yFooterText = yFooterLine + (hFooter / 2);

    // Obtener PK
    const textoPK = getCurrentPKText();

    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'middle';

    // Columna 1: Proyecto
    ctx.textAlign = 'left';
    ctx.font = `bold ${16 * SCALE}px Arial`;
    ctx.fillText("PROYECTO: CARRETERA MODELO", mOut + (30 * SCALE), yFooterText);

    // Columna 2: PK (Central)
    ctx.textAlign = 'center';
    ctx.font = `bold ${24 * SCALE}px Arial`;
    ctx.fillText(textoPK, W / 2, yFooterText);

    // Columna 3: Escala / Info
    ctx.textAlign = 'right';
    ctx.font = `${14 * SCALE}px Arial`;
    ctx.fillText("ESCALA: S/E  |  LÁMINA: 01", W - mOut - (30 * SCALE), yFooterText);


    // ----------------------------------------------------
    // E. DESCARGA
    // ----------------------------------------------------
    descargarPlano(sheet, tituloVista);
}

// 3. UTILIDADES COMPATIBILIDAD

// ============================================================
// UTILIDADES COMPARTIDAS
// ============================================================
function getCurrentPKText() {
    if (!appState.secciones || appState.secciones.length === 0) return "PK: --+---";
    const sec = appState.secciones[appState.currentIdx];
    const val = sec.k || sec.km || 0;
    const k = Math.floor(val / 1000);
    const m = Math.abs(val % 1000).toFixed(0).padStart(3, '0');
    return `PK: ${k}+${m}`;
}

function descargarPlano(canvas, nombreBase) {
    try {
        // 1. Obtener PK (Solo parte entera)
        let pkStr = "General";
        if (appState.secciones && appState.secciones.length > 0) {
            const val = appState.secciones[appState.currentIdx].k;
            pkStr = Math.floor(val).toString();
        }

        // 2. Generar Fecha y Hora compacta (YYYYMMDD_HHMMSS)
        const now = new Date();
        const anio = now.getFullYear();
        const mes = String(now.getMonth() + 1).padStart(2, '0');
        const dia = String(now.getDate()).padStart(2, '0');
        const hora = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const seg = String(now.getSeconds()).padStart(2, '0');

        // Formato compacto: 20260213_114605
        const fechaHora = `${anio}${mes}${dia}_${hora}${min}${seg}`;

        // 3. Construir Nombre Final
        const nombreArchivo = `Ti_${nombreBase}_PK${pkStr}_${fechaHora}.png`;

        // 4. Descargar
        const link = document.createElement('a');
        link.download = nombreArchivo;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Error al exportar:", err);
        alert("Error al generar imagen.");
    }
}