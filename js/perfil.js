function dibujarPerfil() {
    const canvas = document.getElementById('canvasPerfil');
    if (!canvas || !appState.perfil) return;
    const ctx = canvas.getContext('2d');
    
    // --- ESTILOS GENERALES ---
    const isLight = appConfig.general.theme === 'light';
    const escalaTxt = appConfig.general.textScale || 1.0;

    // Colores
    const colorGrilla = isLight ? "#e0e0e0" : "#222";
    const colorTexto  = isLight ? "#666" : "#888";
    const colorTxtPto = isLight ? "#000" : "white";      

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // --- FUNCIÓN PARA FORMATEAR 0+000 ---
    const fmtPK = (val) => {
        const k = Math.floor(val / 1000);
        // Math.abs para evitar signos raros en el 0, padStart para que sea 005 y no 5
        const m = Math.abs(val % 1000).toFixed(0).padStart(3, '0');
        return `${k}+${m}`;
    };

    // 1. DATOS Y ESCALAS
    const { minK, maxK, minZ, maxZ } = appState.encuadre.perfil;
    const centroK = (minK + maxK) / 2;
    const centroZ = (minZ + maxZ) / 2;

    const exajVertical = appConfig.perfil.exaj || 10; 

    const rangeK = maxK - minK;
    const rangeZ = (maxZ - minZ) * exajVertical;
    const scale = Math.min(W / (rangeK * 1.1), H / (rangeZ * 1.1)); 

    const toX = (k) => (W / 2) + (k - centroK) * scale;
    const toY = (z) => (H / 2) - (z - centroZ) * exajVertical * scale;

    const cam = appState.cameras.perfil;

    // Configuración de Grilla
    const dashboard = document.getElementById('main-dashboard');
    const esModoMini = dashboard && dashboard.classList.contains('layout-multi');

    let gStepK = esModoMini ? (appConfig.perfil.gridKMulti || 1000) : (appConfig.perfil.gridK || 100);
    let gStepZ = esModoMini ? (appConfig.perfil.gridZMulti || 50) : (appConfig.perfil.gridZ || 5);
    
    if (gStepK <= 0) gStepK = 100;
    if (gStepZ <= 0) gStepZ = 5;

    // Cálculo de rangos con "Colchón" (Gap)
    const lineasExtra = 5; 
    const gapK = gStepK * lineasExtra;
    const gapZ = gStepZ * lineasExtra;

    // Definimos inicio y fin para los bucles
    const startK = Math.floor((minK - gapK) / gStepK) * gStepK;
    const endK   = maxK + gapK;
    const startZ = Math.floor((minZ - gapZ) / gStepZ) * gStepZ;
    const endZ   = maxZ + gapZ;

    // ============================================================
    // FASE 1: DIBUJO EN EL MUNDO (Líneas y Gráficos)
    // ============================================================
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // A. Grilla (Solo Líneas)
    ctx.lineWidth = 1 / cam.zoom;
    ctx.strokeStyle = colorGrilla; 
    
    // Vertical (PK)
    for (let k = startK; k <= endK; k += gStepK) {
        let sx = toX(k);
        ctx.beginPath(); ctx.moveTo(sx, -50000); ctx.lineTo(sx, 50000); ctx.stroke();
    }
    
    // Horizontal (Cota)
    for (let z = startZ; z <= endZ; z += gStepZ) {
        let sy = toY(z);
        ctx.beginPath(); ctx.moveTo(-50000, sy); ctx.lineTo(50000, sy); ctx.stroke();
    }

    // B. Perfiles (Gestor de Capas)
    appState.perfil.forEach((p, idx) => {
        const nombre = p.nombre || `Perfil ${idx+1}`;
        const style = (appConfig.layers && appConfig.layers.perfil && appConfig.layers.perfil[nombre])
                      ? appConfig.layers.perfil[nombre]
                      : { visible: true, color: '#fff', width: 2 };

        if (!style.visible) return;

        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.width / cam.zoom;
        
        if (p.data) {
            p.data.forEach((pt, i) => {
                const k = pt[0], z = pt[1];
                if (i === 0) ctx.moveTo(toX(k), toY(z));
                else ctx.lineTo(toX(k), toY(z));
            });
        }
        ctx.stroke();
    });

    // C. Punto Rojo (Rastreo)
    if (appState.secciones && appState.secciones.length > 0) {
        const pkActual = appState.secciones[appState.currentIdx].k;
        const xPos = toX(pkActual);

        // Línea guía
        ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(255, 0, 0, 0.5)"; ctx.lineWidth = 1 / cam.zoom;
        ctx.beginPath(); ctx.moveTo(xPos, -5000); ctx.lineTo(xPos, 5000); ctx.stroke();
        ctx.setLineDash([]);

        // Buscar punto
        const targetName = appConfig.perfil.target || 'auto';
        let foundAuto = false;

        appState.perfil.forEach((p, idx) => {
            const nombre = p.nombre || `Perfil ${idx+1}`;
            if (targetName !== 'auto' && nombre !== targetName) return;
            if (targetName === 'auto' && foundAuto) return;

            const style = (appConfig.layers && appConfig.layers.perfil && appConfig.layers.perfil[nombre]);
            if (style && !style.visible) return;

            if (p.data) {
                const pt = p.data.find(d => Math.abs(d[0] - pkActual) < 2); 
                if (pt) {
                    // Dibujar Punto
                    ctx.fillStyle = isLight ? "#ff00dd" : "#fbff00";
                    ctx.beginPath(); ctx.arc(toX(pt[0]), toY(pt[1]), 6 / cam.zoom, 0, Math.PI * 2); ctx.fill();
                    
                    // Texto Cota (Este se queda pegado al punto en el mundo)
                    ctx.fillStyle = colorTxtPto; 
                    ctx.font = `bold ${(12 * escalaTxt) / cam.zoom}px Arial`;
                    ctx.textAlign = "left";
                    ctx.fillText(`Z: ${pt[1].toFixed(2)}`, toX(pt[0]) + 8 / cam.zoom, toY(pt[1]) - 8 / cam.zoom);
                    
                    if (targetName === 'auto') foundAuto = true;
                }
            }
        });
    }
    ctx.restore();
    // ============================================================
    // FIN FASE 1
    // ============================================================


    // ============================================================
    // FASE 2: DIBUJO HUD (Textos Fijos en Bordes)
    // ============================================================
    
    const gapX = 10;
    const gapTop = 10;
    const gapBottom = 10; // Protegido para móviles

    ctx.font = `${11 * escalaTxt}px monospace`;
    ctx.fillStyle = colorTexto;

    const worldToScreenX = (k) => (toX(k) * cam.zoom) + cam.x;
    const worldToScreenY = (z) => (toY(z) * cam.zoom) + cam.y;

    // 1. Verticales (PK) - Texto Abajo/Arriba
    for (let k = startK; k <= endK; k += gStepK) {
        const sx = worldToScreenX(k);
        
        // Solo dibujar si está visible
        if (sx > -50 && sx < W + 50) {
            ctx.textAlign = "center";
            
            // --- [MODIFICADO] USAMOS LA VARIABLE texto ---
            const texto = fmtPK(k); 

            // Abajo
            ctx.textBaseline = "bottom";
            ctx.fillText(texto, sx, H - gapBottom); // <--- Usamos 'texto' en vez de k.toFixed(0)

            // Arriba
            ctx.textBaseline = "top";
            ctx.fillText(texto, sx, gapTop);        // <--- Usamos 'texto' en vez de k.toFixed(0)
        }
    }

    // 2. Horizontales (Cota) - Texto Izquierda/Derecha
    for (let z = startZ; z <= endZ; z += gStepZ) {
        const sy = worldToScreenY(z);
        
        // Solo dibujar si está visible
        if (sy > -20 && sy < H + 20) {
            ctx.textBaseline = "middle";

            // Izquierda
            ctx.textAlign = "left";
            ctx.fillText(z.toFixed(1), gapX, sy);

            // Derecha
            ctx.textAlign = "right";
            ctx.fillText(z.toFixed(1), W - gapX, sy);
        }
    }
}