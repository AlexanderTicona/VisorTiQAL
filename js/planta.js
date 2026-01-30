// js/planta.js
function dibujarPlanta() {
    const canvas = document.getElementById('canvasPlanta');
    if (!canvas || !appState.planta) return;
    const ctx = canvas.getContext('2d');
    
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const W = canvas.width, H = canvas.height;

    const geo = appState.planta.geometria;
    if (!geo || geo.length === 0) return;

    // 1. LÍMITES BASE (Para el encuadre inicial)
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    geo.forEach(p => {
        if (p.e < minE) minE = p.e; if (p.e > maxE) maxE = p.e;
        if (p.n < minN) minN = p.n; if (p.n > maxN) maxN = p.n;
    });

    const finalScale = Math.min(W / ((maxE - minE) * 1.2), H / ((maxN - minN) * 1.2));
    const marginX = (W - (maxE - minE) * finalScale) / 2;
    const marginY = (H - (maxN - minN) * finalScale) / 2;

    const toX = (e) => marginX + (e - minE) * finalScale;
    const toY = (n) => H - (marginY + (n - minN) * finalScale);

    ctx.save();
    const cam = appState.cameras.planta;
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // --- 2. GRILLA DINÁMICA (Cubre todo el cuadro) ---
    const invScale = finalScale * cam.zoom;
    const utmVisMinE = minE + (-cam.x - marginX * cam.zoom) / invScale;
    const utmVisMaxE = utmVisMinE + W / invScale;
    const utmVisMaxN = maxN - (-cam.y - marginY * cam.zoom) / invScale;
    const utmVisMinN = utmVisMaxN - H / invScale;

    // Tamaño de grilla que cambia según el Zoom (LOD)
    let gSize = 100;
    if (cam.zoom < 0.5) gSize = 500;
    if (cam.zoom < 0.1) gSize = 1000;
    if (cam.zoom < 0.02) gSize = 5000;

    ctx.lineWidth = 1 / cam.zoom;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = `${11 / cam.zoom}px monospace`;

    // Posiciones "Sticky" para los textos (HUD)
    const yTextoFijo = (H - cam.y - 15) / cam.zoom;
    const xTextoFijo = (10 - cam.x) / cam.zoom;

    // Dibujo Este (X)
    for (let e = Math.floor(utmVisMinE / gSize) * gSize; e <= utmVisMaxE; e += gSize) {
        let x = toX(e);
        ctx.beginPath();
        ctx.moveTo(x, toY(utmVisMinN)); ctx.lineTo(x, toY(utmVisMaxN));
        ctx.stroke();
        ctx.fillText(e.toFixed(0), x + 2 / cam.zoom, yTextoFijo);
    }

    // Dibujo Norte (Y)
    for (let n = Math.floor(utmVisMinN / gSize) * gSize; n <= utmVisMaxN; n += gSize) {
        let y = toY(n);
        ctx.beginPath();
        ctx.moveTo(toX(utmVisMinE), y); ctx.lineTo(toX(utmVisMaxE), y);
        ctx.stroke();
        ctx.fillText(n.toFixed(0), xTextoFijo, y - 2 / cam.zoom);
    }

    // --- 3. DIBUJAR ALINEAMIENTO ---
    ctx.beginPath();
    ctx.strokeStyle = "#00fbff";
    ctx.lineWidth = 2 / cam.zoom;
    geo.forEach((p, i) => {
        if (i === 0) ctx.moveTo(toX(p.e), toY(p.n));
        else ctx.lineTo(toX(p.e), toY(p.n));
    });
    ctx.stroke();

    // --- 4. PUNTO ROJO DE SECCIÓN ACTUAL ---
    if (appState.secciones && appState.secciones.length > 0) {
        const secActual = appState.secciones[appState.currentIdx];
        const mActual = secActual.k || secActual.km || 0;
        const pRef = geo.reduce((prev, curr) => Math.abs(curr.k - mActual) < Math.abs(prev.k - mActual) ? curr : prev);
        if (pRef) {
            ctx.fillStyle = "red";
            ctx.beginPath();
            ctx.arc(toX(pRef.e), toY(pRef.n), 6 / cam.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.fillText(`PK ${mActual.toFixed(2)}`, toX(pRef.e) + 10 / cam.zoom, toY(pRef.n));
        }
    }
    ctx.restore();
}