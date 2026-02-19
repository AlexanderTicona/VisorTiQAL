function dibujarSeccion(seccion) {
    const canvas = document.getElementById('visorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // --- ESTILOS ---
    const isLight = appConfig.general.theme === 'light';
    const escalaTxt = appConfig.general.textScale || 1.0;

    const colorGrillaSec = isLight ? "#e0e0e0" : "#222";
    const colorGrillaEje = isLight ? "rgba(0,123,255,0.4)" : "rgba(0, 251, 255, 0.4)";
    const colorTexto = isLight ? "#666" : "#888";
    const colorTextoEje = isLight ? "#0056b3" : "#00fbff";
    const colorCursor = isLight ? "#007bff" : "#00fbff";
    const colorCursorStroke = isLight ? "#fff" : "white";

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!seccion) return;

    // 1. CÁLCULO DE LÍMITES Y ESCALAS
    let minX, maxX, minY, maxY;

    // USAR CACHÉ (Optimización)
    if (seccion._cach) {
        ({ minX, maxX, minY, maxY } = seccion._cach);
    } else {
        // Fallback: Calcular si no existe caché
        minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
        const escanear = (listas) => {
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
        escanear(seccion.t); escanear(seccion.c);
        if (minY > maxY) { minY = 0; maxY = 10; minX = -10; maxX = 10; }

        // Guardamos para la próxima
        seccion._cach = { minX, maxX, minY, maxY };
    }

    // Forzar simetría en X (Uniformidad)
    const maxDist = Math.max(Math.abs(minX), Math.abs(maxX));
    minX = -maxDist;
    maxX = maxDist;

    const rangeX = (maxX - minX) * 1.0; //Gap o margen de seguridad
    const rangeY = (maxY - minY) * 1.2; //Gap o margen de seguridad
    const scale = Math.min(W / rangeX, H / rangeY);
    const marginX = (W - (maxX - minX) * scale) / 2;
    const marginY = (H - (maxY - minY) * scale) / 2;

    appState.transform = { minX, minY, scale, mx: marginX, my: marginY };

    const toX = (v) => marginX + (v - minX) * scale;
    const toY = (v) => H - (marginY + (v - minY) * scale);

    const cam = appState.cameras.seccion;

    // ============================================================
    // FASE 1: DIBUJO EN EL MUNDO (Líneas que se mueven con zoom)
    // ============================================================
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // Grilla
    let gX = appConfig.seccion.gridX || 5; if (gX <= 0) gX = 5;
    let gY = appConfig.seccion.gridY || 5; if (gY <= 0) gY = 5;

    const centroX = (minX + maxX) / 2;
    const centroY = (minY + maxY) / 2;

    // Calcular límites de grilla visibles (aprox) para no dibujar infinito
    const sX = Math.floor((centroX - (W / scale) / cam.zoom) / gX) * gX;
    const eX = sX + (W * 2 / scale) / cam.zoom;
    const sY = Math.floor((centroY - (H / scale) / cam.zoom) / gY) * gY;
    const eY = sY + (H * 2 / scale) / cam.zoom;

    // Dibujar Líneas Verticales
    for (let x = sX; x <= eX; x += gX) {
        let sx = toX(x);
        const esEje = Math.abs(x) < 0.01;
        ctx.strokeStyle = esEje ? colorGrillaEje : colorGrillaSec;
        ctx.lineWidth = (esEje ? 2 : 1) / cam.zoom;
        ctx.beginPath(); ctx.moveTo(sx, -50000); ctx.lineTo(sx, 50000); ctx.stroke();
    }
    // Dibujar Líneas Horizontales
    for (let y = sY; y <= eY; y += gY) {
        let sy = toY(y);
        ctx.strokeStyle = colorGrillaSec;
        ctx.lineWidth = 1 / cam.zoom;
        ctx.beginPath(); ctx.moveTo(-50000, sy); ctx.lineTo(50000, sy); ctx.stroke();
    }

    // Dibujar Capas (Terreno, Corredor)
    if (appConfig.layers && appConfig.layers.seccion) {
        Object.values(appConfig.layers.seccion).forEach(layer => {
            if (!layer.visible) return;
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = layer.width / cam.zoom;
            if (layer.type === 't' && seccion.t && seccion.t[layer.idx]) {
                const d = seccion.t[layer.idx];
                dibujarPolyFlat(ctx, Array.isArray(d) ? d : d.p, toX, toY);
            } else if (layer.type === 'c' && seccion.c) {
                seccion.c.forEach(obj => dibujarPolyFlat(ctx, Array.isArray(obj) ? obj : obj.p, toX, toY));
            }
        });
    } else {
        // Fallback
        if (seccion.t) { ctx.strokeStyle = "#8b4513"; ctx.lineWidth = 2 / cam.zoom; seccion.t.forEach(o => dibujarPolyFlat(ctx, Array.isArray(o) ? o : o.p, toX, toY)); }
        if (seccion.c) { ctx.strokeStyle = "#007bff"; ctx.lineWidth = 1.5 / cam.zoom; seccion.c.forEach(o => dibujarPolyFlat(ctx, Array.isArray(o) ? o : o.p, toX, toY)); }
    }

    // Mira (Crosshair) - Puntos Mundo
    // Mira (Crosshair) - Puntos Mundo
    // Mira (Crosshair) - Puntos Mundo

    // 0. DIBUJAR CURSOR CRUZ (AutoCAD Style)
    if (appState.currentTool === 'dist' || appState.currentTool === 'slope') {
        const pCur = appState.snapCandidate || appState.currentCursorPos;
        if (pCur) {
            ctx.save();
            // Deshacemos zoom para dibujar cursor en espacio pantalla (tamaño constante)
            ctx.scale(1 / cam.zoom, 1 / cam.zoom);
            const scX = toX(pCur.x) * cam.zoom; // Coordenada pantalla relativa al cam
            const scY = toY(pCur.y) * cam.zoom;

            // Pickbox (Cuadradito del cursor)
            // Solo dejamos el cuadro central ("Pickbox") sin líneas infinitas para mayor limpieza
            const box = 10;
            ctx.strokeStyle = isLight ? "#000" : "#fff";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(scX - box / 2, scY - box / 2, box, box);

            ctx.restore();
        }
    }

    // 1. DIBUJAR SNAP MARKER (Cuadrado Verde al atrapar punto)
    if (appState.snapCandidate && appState.currentTool !== 'none') {
        const sx = toX(appState.snapCandidate.x);
        const sy = toY(appState.snapCandidate.y);

        // Marker de vértice (Cuadrado)
        const size = 6 / cam.zoom; // Tamaño mundo para que se vea constante al zoom? 
        // No, si divido por cam.zoom, al multiplicarse por cam.zoom en el ctx.scale, queda de 6px pantalla.

        ctx.strokeStyle = "#00E676"; // Green
        ctx.lineWidth = 2.5 / cam.zoom;
        ctx.beginPath();
        // Cuadrado simple
        ctx.rect(sx - size, sy - size, size * 2, size * 2);
        ctx.stroke();
    }

    // 2. DIBUJAR HERRAMIENTA DISTANCIA O PENDIENTE
    if ((appState.currentTool === 'dist' || appState.currentTool === 'slope') && appState.measureP1) {
        const p1 = appState.measureP1;

        let p2 = appState.measureP2;
        if (!p2) {
            // Si no hemos hecho click 2, usamos el candidato de snap o la posición libre del cursor
            p2 = appState.snapCandidate ? appState.snapCandidate : appState.currentCursorPos;
        }

        if (p2) {
            const x1 = toX(p1.x), y1 = toY(p1.y);
            const x2 = toX(p2.x), y2 = toY(p2.y);

            // Línea
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);

            if (appState.currentTool === 'slope') {
                ctx.strokeStyle = '#FF6D00'; // Deep Orange (Pendiente)
            } else {
                ctx.strokeStyle = '#E91E63'; // Deep Pink (Distancia)
            }

            ctx.lineWidth = 2 / cam.zoom; // Un poco más grueso
            ctx.setLineDash([5 / cam.zoom, 3 / cam.zoom]); // Punteada
            ctx.stroke();
            ctx.setLineDash([]);

            // Puntos extremos
            ctx.fillStyle = (appState.currentTool === 'slope') ? '#FF6D00' : '#E91E63';
            const r = 4 / cam.zoom; // Puntos un poco más grandes
            ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();

            // Texto (Distancia o Pendiente)
            const dx = Math.abs(p2.x - p1.x);
            const dy = Math.abs(p2.y - p1.y); // dZ

            let txt = "";
            if (appState.currentTool === 'slope') {
                let pct = 0;
                if (dx !== 0) pct = (dy / dx) * 100;
                else pct = 9999.9;
                txt = `${pct.toFixed(2)}%`;
            } else {
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                txt = `${dist.toFixed(3)}m`;
            }

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            ctx.save();
            ctx.translate(midX, midY);
            ctx.scale(1 / cam.zoom, 1 / cam.zoom);

            ctx.fillStyle = "#000";
            ctx.strokeStyle = (appState.currentTool === 'slope') ? '#FF6D00' : '#E91E63';
            ctx.lineWidth = 2;
            ctx.font = "bold 13px sans-serif";

            // CENTRADO EXPLÍCITO (Evita deriva heredada)
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const tm = ctx.measureText(txt);
            const boxW = tm.width + 12;
            const boxH = 20;

            // Fondo semitransparente centrado
            ctx.fillStyle = "rgba(15, 23, 42, 0.8)"; // Gris muy oscuro casi negro (Slate 900)
            ctx.fillRect(-boxW / 2, -30, boxW, boxH);

            ctx.fillStyle = (appState.currentTool === 'slope') ? '#FF6D00' : '#E91E63';
            ctx.fillText(txt, 0, -20); // Centrado en X=0, Y=-20
            ctx.restore();
        }
    }

    // 2. DIBUJAR ÚLTIMO CLIC (MARCADOR FIJO)
    if (appState.lastMarker) {
        const px = toX(appState.lastMarker.x);
        const py = toY(appState.lastMarker.y);

        ctx.fillStyle = colorCursor;
        ctx.beginPath(); ctx.arc(px, py, 4 / cam.zoom, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = colorCursorStroke; ctx.lineWidth = 1.5 / cam.zoom;
        const s = 10 / cam.zoom;
        ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px + s, py); ctx.moveTo(px, py - s); ctx.lineTo(px, py + s); ctx.stroke();
    }

    ctx.restore();
    // ============================================================
    // FIN FASE 1: Se cierra la matriz de transformación
    // ============================================================


    // ============================================================
    // FASE 2: DIBUJO HUD (Textos fijos en bordes)
    // ============================================================

    // CONFIGURACIÓN DE GAPS (MÁRGENES)
    const gapX = 10; // Margen lateral (izquierda/derecha)
    const gapY = 10; // Margen vertical (arriba/abajo)

    ctx.font = `${11 * escalaTxt}px monospace`;

    // Función auxiliar para proyectar coordenada Mundo -> Pantalla
    const worldToScreenX = (valX) => (toX(valX) * cam.zoom) + cam.x;
    const worldToScreenY = (valY) => (toY(valY) * cam.zoom) + cam.y;

    // 1. Textos Verticales (Desfases X)
    for (let x = sX; x <= eX; x += gX) {
        const screenX = worldToScreenX(x);

        // Solo dibujamos si cae dentro de la pantalla (con un poco de margen)
        if (screenX > -20 && screenX < W + 20) {
            const esEje = Math.abs(x) < 0.01;
            ctx.fillStyle = esEje ? colorTextoEje : colorTexto;
            ctx.textAlign = "center";

            // Texto Abajo (H - gapY)
            ctx.textBaseline = "bottom";
            ctx.fillText(x.toFixed(1), screenX, H - gapY);

            // Texto Arriba (gapY)
            ctx.textBaseline = "top";
            ctx.fillText(x.toFixed(1), screenX, gapY);
        }
    }

    // 2. Textos Horizontales (Elevaciones Y)
    for (let y = sY; y <= eY; y += gY) {
        const screenY = worldToScreenY(y);

        if (screenY > -20 && screenY < H + 20) {
            ctx.fillStyle = colorTexto;
            ctx.textBaseline = "middle";

            // Texto Izquierda (gapX)
            ctx.textAlign = "left";
            ctx.fillText(y.toFixed(1), gapX, screenY);

            // Texto Derecha (W - gapX)
            ctx.textAlign = "right";
            ctx.fillText(y.toFixed(1), W - gapX, screenY);
        }
    }
}

function dibujarPolyFlat(ctx, arr, toX, toY) {
    if (!arr || arr.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(toX(arr[0]), toY(arr[1]));
    for (let i = 2; i < arr.length; i += 2) {
        ctx.lineTo(toX(arr[i]), toY(arr[i + 1]));
    }
    ctx.stroke();
}