// js/seccion.js
function dibujarSeccion(seccion) {
    const canvas = document.getElementById('visorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    if (!seccion) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const analizar = (pts) => {
        if (!pts || pts.length === 0) return;
        const esPlano = typeof pts[0] === 'number';
        for (let i = 0; i < pts.length; i += (esPlano ? 2 : 1)) {
            const p = esPlano ? { x: pts[i], y: pts[i+1] } : pts[i];
            if (p.y > -500) {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            }
        }
    };

    if (seccion.t) seccion.t.forEach(capa => analizar(capa.p));
    if (seccion.c) seccion.c.forEach(lista => analizar(lista));
    if (minX === Infinity) { minX = -20; maxX = 20; minY = 2900; maxY = 2920; }

    const finalScale = Math.min(W / ((maxX - minX) * 1.4), H / ((maxY - minY) * 1.4));
    const marginX = (W - (maxX - minX) * finalScale) / 2 + (20 * window.devicePixelRatio); 
const marginY = (H - (maxY - minY) * finalScale) / 2 + (20 * window.devicePixelRatio);
    
    appState.transform = { minX, minY, scale: finalScale, mx: marginX, my: marginY };
    const toX = (v) => marginX + (v - minX) * finalScale;
    const toY = (v) => H - (marginY + (v - minY) * finalScale);

    ctx.save();
    // Uso de cámara independiente de sección
    const cam = appState.cameras.seccion;
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // --- DIBUJAR GRILLA EXTENDIDA (Líneas Infinitas) ---
const gX = parseFloat(document.getElementById('inpGridX').value) || 5;
const gY = parseFloat(document.getElementById('inpGridY').value) || 5;

// Definimos el rango de dibujo de la grilla (el doble del límite)
const gridMinX = minX - (maxX - minX);
const gridMaxX = maxX + (maxX - minX);
const gridMinY = minY - (maxY - minY);
const gridMaxY = maxY + (maxY - minY);

ctx.font = `${12 / cam.zoom}px Arial`;

// --- GRILLA OFFSET (Verticales Infinitas) ---
for (let x = Math.floor(gridMinX / gX) * gX; x <= gridMaxX; x += gX) {
    let sx = toX(x);
    
    // Resaltado del Eje 0.0
    if (Math.abs(x) < 0.01) {
        ctx.strokeStyle = "rgba(0, 251, 255, 0.4)"; 
        ctx.lineWidth = 2 / cam.zoom;
    } else {
        ctx.strokeStyle = "#222"; 
        ctx.lineWidth = 1 / cam.zoom;
    }
    
    ctx.beginPath(); 
    // CAMBIO: En lugar de 0 a H, usamos de gridMinY a gridMaxY transformados
    ctx.moveTo(sx, toY(gridMinY)); 
    ctx.lineTo(sx, toY(gridMaxY)); 
    ctx.stroke();
    
    // Texto del Offset anclado a minY (base del terreno)
    ctx.fillStyle = (Math.abs(x) < 0.01) ? "#00fbff" : "#666";
    ctx.fillText(x.toFixed(1), sx + 2, toY(minY) + 15 / cam.zoom);
}

// --- GRILLA ELEVACIÓN (Horizontales Infinitas) ---
ctx.lineWidth = 1 / cam.zoom;
ctx.strokeStyle = "#222";

for (let y = Math.floor(gridMinY / gY) * gY; y <= gridMaxY; y += gY) {
    let sy = toY(y);
    
    ctx.beginPath(); 
    // CAMBIO: En lugar de 0 a W, usamos de gridMinX a gridMaxX transformados
    ctx.moveTo(toX(gridMinX), sy); 
    ctx.lineTo(toX(gridMaxX), sy); 
    ctx.stroke();
    
    // Texto de Elevación anclado a minX (borde izquierdo)
    ctx.fillStyle = "#666";
    ctx.fillText(y.toFixed(1), toX(minX) - 35 / cam.zoom, sy - 2);
}

// --- DIBUJAR CAPAS (Terreno y Corredor) ---
if (seccion.t) seccion.t.forEach(capa => dibujarLinea(ctx, capa.p, "#8b4513", 2, toX, toY, cam.zoom));
if (seccion.c) seccion.c.forEach(pts => dibujarLinea(ctx, pts, "#00fbff", 1.5, toX, toY, cam.zoom));
if (appState.lastClick) {
    const px = toX(appState.lastClick.x);
    const py = toY(appState.lastClick.y);
    
    // Dibujamos una pequeña mira cyan
    ctx.strokeStyle = "#bbff00";
    ctx.lineWidth = 2 / cam.zoom;
    
    // Cruz de referencia
    const size = 10 / cam.zoom;
    ctx.beginPath();
    ctx.moveTo(px - size, py); ctx.lineTo(px + size, py);
    ctx.moveTo(px, py - size); ctx.lineTo(px, py + size);
    ctx.stroke();
    
    // Punto central
    ctx.fillStyle = "#bbff00";
    ctx.beginPath();
    ctx.arc(px, py, 3 / cam.zoom, 0, Math.PI * 2);
    ctx.fill();
}
ctx.restore();
}

function dibujarLinea(ctx, pts, color, width, toX, toY, zoom) {
    ctx.strokeStyle = color; ctx.lineWidth = width / zoom;
    ctx.beginPath();
    const esPlano = typeof pts[0] === 'number';
    for (let i = 0; i < pts.length; i += (esPlano ? 2 : 1)) {
        const p = esPlano ? { x: pts[i], y: pts[i+1] } : pts[i];
        i === 0 ? ctx.moveTo(toX(p.x), toY(p.y)) : ctx.lineTo(toX(p.x), toY(p.y));
    }
    ctx.stroke();
}