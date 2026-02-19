function dibujarPlanta() {
    const canvas = document.getElementById('canvasPlanta');
    if (!canvas || !appState.planta) return;
    const ctx = canvas.getContext('2d');

    // --- CONFIGURACIÓN GENERAL ---
    const isLight = appConfig.general.theme === 'light';
    const escalaTxt = appConfig.general.textScale || 1.0;

    // Colores
    const colorGrilla = isLight ? "#e0e0e0" : "#222";
    const colorTexto = isLight ? "#666" : "#888";
    const colorPunto = isLight ? "#ff00dd" : "#fbff00"
    const colorTxtPK = isLight ? "#000000" : "#ffffff";

    // Configuración de Ticks
    const verEtiquetas = appConfig.planta.showLabels !== false;
    const intMajor = appConfig.planta.ticksMajor || 1000;
    const intMinor = appConfig.planta.ticksMinor || 100;

    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // 1. DATOS
    const trazo = appState.planta.planta_trazo || appState.planta.geometria || appState.planta.planta || [];
    const hitos = appState.planta.planta_hitos || [];

    if (!trazo || trazo.length === 0) return;

    // 2. ESCALAS
    const { minE, maxE, minN, maxN } = appState.encuadre.planta;
    const centroE = (minE + maxE) / 2;
    const centroN = (minN + maxN) / 2;
    const scale = Math.min(W / ((maxE - minE) * 1.1), H / ((maxN - minN) * 1.1)); // Gap o margen de seguridad

    const toX = (e) => (W / 2) + (e - centroE) * scale;
    const toY = (n) => (H / 2) - (n - centroN) * scale;

    const cam = appState.cameras.planta;

    // ============================================================
    // FASE 1: DIBUJO EN EL MUNDO (Líneas, Eje, Ticks)
    // ============================================================
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // --- A. GRILLA (Solo Líneas) ---
    const dashboard = document.getElementById('main-dashboard');
    const esModoMini = dashboard && dashboard.classList.contains('layout-multi');
    let gSize = esModoMini ? (appConfig.planta.gridIntervalMulti || 500) : (appConfig.planta.gridInterval || 200);
    if (gSize <= 0) gSize = 100;

    // Calculamos límites visibles para optimizar bucles
    // (Invertimos la pantalla para saber qué coordenadas E/N estamos viendo)
    const viewLeft = -cam.x / cam.zoom;
    const viewTop = -cam.y / cam.zoom;
    const viewRight = (W - cam.x) / cam.zoom;
    const viewBottom = (H - cam.y) / cam.zoom;

    // Convertimos pixels de pantalla inversa a coordenadas E/N (Aprox)
    // Nota: Es un cálculo aproximado para el "culling" (no dibujar infinito)
    // E = centroE + (x_world - W/2) / scale
    const startE_aprox = centroE + (viewLeft - W / 2) / scale;
    const endE_aprox = centroE + (viewRight - W / 2) / scale;
    const startN_aprox = centroN - (viewBottom - H / 2) / scale; // Y invertido
    const endN_aprox = centroN - (viewTop - H / 2) / scale;

    const startE = Math.floor(startE_aprox / gSize) * gSize - gSize;
    const endE = Math.ceil(endE_aprox / gSize) * gSize + gSize;
    const startN = Math.floor(startN_aprox / gSize) * gSize - gSize;
    const endN = Math.ceil(endN_aprox / gSize) * gSize + gSize;

    if (appConfig.planta.showGrid !== false) {
        ctx.lineWidth = 1 / cam.zoom;
        ctx.strokeStyle = colorGrilla;

        // Verticales (Este)
        for (let e = startE; e <= endE; e += gSize) {
            let x = toX(e);
            ctx.beginPath(); ctx.moveTo(x, -50000); ctx.lineTo(x, 50000); ctx.stroke();
            // ¡YA NO DIBUJAMOS TEXTO AQUÍ!
        }

        // Horizontales (Norte)
        for (let n = startN; n <= endN; n += gSize) {
            let y = toY(n);
            ctx.beginPath(); ctx.moveTo(-50000, y); ctx.lineTo(50000, y); ctx.stroke();
            // ¡YA NO DIBUJAMOS TEXTO AQUÍ!
        }
    }

    // --- B. ALINEAMIENTO (Eje y Ticks) ---
    // (Este bloque se mantiene IGUAL porque los ticks SÍ deben moverse con el zoom)
    const layerEje = (appConfig.layers && appConfig.layers.planta && appConfig.layers.planta['Eje'])
        ? appConfig.layers.planta['Eje']
        : { visible: true, color: isLight ? "#0056b3" : "#00fbff", width: 2 };

    if (layerEje.visible) {
        ctx.beginPath();
        ctx.strokeStyle = layerEje.color;
        ctx.lineWidth = layerEje.width / cam.zoom;

        const esArray3 = Array.isArray(trazo[0]) && trazo[0].length === 3;
        const esArray2 = Array.isArray(trazo[0]) && trazo[0].length === 2;

        trazo.forEach((pt, i) => {
            let x, y;
            if (esArray3) { x = pt[1]; y = pt[2]; }
            else if (esArray2) { x = pt[0]; y = pt[1]; }
            else { x = pt.x || pt.e; y = pt.y || pt.n; }

            if (i === 0) ctx.moveTo(toX(x), toY(y));
            else ctx.lineTo(toX(x), toY(y));
        });
        ctx.stroke();

        // Ticks sobre el eje (Estos se quedan en el Mundo, FASE 1)
        if (esArray3) {
            ctx.fillStyle = isLight ? "#000" : "#fff";
            ctx.font = `${(10 * escalaTxt) / cam.zoom}px Arial`;
            const sizeMajor = 8 / cam.zoom;
            const sizeMinor = 4 / cam.zoom;
            const verTicks = appConfig.planta.showTicks !== false;

            for (let i = 0; i < trazo.length - 1; i++) {
                const p1 = trazo[i]; const p2 = trazo[i + 1];
                const k1 = p1[0]; const k2 = p2[0];
                if (k2 <= k1) continue;

                const nextMajor = Math.ceil(k1 / intMajor) * intMajor;
                if (nextMajor <= k2) {
                    drawTick(ctx, p1, p2, nextMajor, sizeMajor, true, verEtiquetas, verTicks, toX, toY, cam, isLight);
                }
                let kScan = Math.ceil(k1 / intMinor) * intMinor;
                while (kScan <= k2) {
                    if (kScan % intMajor !== 0) {
                        drawTick(ctx, p1, p2, kScan, sizeMinor, false, false, verTicks, toX, toY, cam, isLight);
                    }
                    kScan += intMinor;
                }
            }
        }
    }

    // --- C. PUNTO ROJO ---
    if (appState.secciones && appState.secciones.length > 0) {
        const secActual = appState.secciones[appState.currentIdx];
        const mActual = secActual.k || secActual.km || 0;
        let pRef = null;
        const esArray3 = Array.isArray(trazo[0]) && trazo[0].length === 3;

        if (esArray3) {
            pRef = trazo.reduce((prev, curr) => (Math.abs(curr[0] - mActual) < Math.abs(prev[0] - mActual) ? curr : prev));
            if (pRef && Math.abs(pRef[0] - mActual) < 50) pRef = { x: pRef[1], y: pRef[2] }; else pRef = null;
        }
        if (!pRef && hitos.length > 0) {
            const hito = hitos.find(h => Math.abs(h.k - mActual) < 2);
            if (hito) pRef = { x: hito.x, y: hito.y };
        }

        if (pRef) {
            ctx.fillStyle = colorPunto;
            ctx.beginPath(); ctx.arc(toX(pRef.x), toY(pRef.y), 6 / cam.zoom, 0, Math.PI * 2); ctx.fill();

            // Etiqueta flotante del PK actual
            ctx.fillStyle = colorTxtPK;
            ctx.font = `bold ${(12 * escalaTxt) / cam.zoom}px Arial`;
            ctx.textAlign = "left";

            // --- FORMATEO 0+000 (Sin decimales) ---
            const kE = Math.floor(mActual / 1000);
            const kM = Math.abs(mActual % 1000).toFixed(0).padStart(3, '0');

            ctx.fillText(`PK ${kE}+${kM}`, toX(pRef.x) + 10 / cam.zoom, toY(pRef.y));
        }
    }

    ctx.restore();
    // ============================================================
    // FIN FASE 1
    // ============================================================


    // ============================================================
    // FASE 2: DIBUJO HUD (Textos de Coordenadas Fijos)
    // ============================================================
    if (appConfig.planta.showGrid !== false) {

        // Gaps Seguros (Igual que en Sección)
        const gapX = 10;
        const gapTop = 10;
        const gapBottom = 10; // Protegido para móviles

        ctx.font = `${11 * escalaTxt}px monospace`;
        ctx.fillStyle = colorTexto;

        // Función auxiliar: Mundo -> Pantalla
        const worldToScreenX = (eVal) => (toX(eVal) * cam.zoom) + cam.x;
        const worldToScreenY = (nVal) => (toY(nVal) * cam.zoom) + cam.y;

        // 1. Coordenadas ESTE (Textos arriba/abajo)
        // Usamos los mismos bucles calculados antes (startE a endE)
        for (let e = startE; e <= endE; e += gSize) {
            const sx = worldToScreenX(e);

            // Solo si está visible en pantalla
            if (sx > -20 && sx < W + 20) {
                ctx.textAlign = "center";

                // Texto Abajo
                ctx.textBaseline = "bottom";
                ctx.fillText(e.toFixed(0), sx, H - gapBottom);

                // Texto Arriba
                ctx.textBaseline = "top";
                ctx.fillText(e.toFixed(0), sx, gapTop);
            }
        }

        // 2. Coordenadas NORTE (Textos izquierda/derecha)
        for (let n = startN; n <= endN; n += gSize) {
            const sy = worldToScreenY(n);

            if (sy > -20 && sy < H + 20) {
                ctx.textBaseline = "middle";

                // Texto Izquierda
                ctx.textAlign = "left";
                ctx.fillText(n.toFixed(0), gapX, sy);

                // Texto Derecha
                ctx.textAlign = "right";
                ctx.fillText(n.toFixed(0), W - gapX, sy);
            }
        }
    }
}

// Función Auxiliar Actualizada (Recibe showLine)
function drawTick(ctx, p1, p2, targetK, size, isMajor, showLabel, showLine, toX, toY, cam, isLight) {
    // 1. Interpolación
    const k1 = p1[0], x1 = p1[1], y1 = p1[2];
    const k2 = p2[0], x2 = p2[1], y2 = p2[2];
    const fraction = (targetK - k1) / (k2 - k1);
    const x = x1 + (x2 - x1) * fraction;
    const y = y1 + (y2 - y1) * fraction;

    // 2. Coordenadas
    const sx = toX(x); const sy = toY(y);
    const sx1 = toX(x1); const sy1 = toY(y1);
    const sx2 = toX(x2); const sy2 = toY(y2);

    // 3. Vector
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    // 4. Perpendicular
    const px = -dy / len;
    const py = dx / len;

    // 5. Dibujar Tick (SOLO SI showLine ES TRUE)
    if (showLine) {
        ctx.beginPath();
        ctx.strokeStyle = isLight ? "#444" : "#ccc";
        ctx.lineWidth = 1 / cam.zoom;
        ctx.moveTo(sx + px * size, sy + py * size);
        ctx.lineTo(sx - px * size, sy - py * size);
        ctx.stroke();
    }

    // 6. Dibujar Etiqueta
    if (isMajor && showLabel) {
        // --- FORMATEO 0+000 ---
        const kEntero = Math.floor(targetK / 1000);
        const kMetros = Math.abs(targetK % 1000).toFixed(0).padStart(3, '0');
        const textoPK = `${kEntero}+${kMetros}`;

        ctx.fillStyle = isLight ? "#000" : "#fff";
        ctx.save();
        ctx.translate(sx + px * (size + 5 / cam.zoom), sy + py * (size + 5 / cam.zoom));

        let angle = Math.atan2(dy, dx) - Math.PI / 2;
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

        ctx.rotate(angle);
        ctx.textAlign = "center";

        // Dibujamos el texto formateado
        ctx.fillText(textoPK, 0, 0);

        ctx.restore();
    }
}