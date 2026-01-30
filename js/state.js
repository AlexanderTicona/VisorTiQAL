// js/state.js
const appState = {
    secciones: [],      // Antes era 'data', ahora lo llamamos secciones para mayor claridad
    planta: null,       // Aquí guardaremos el JSON del alineamiento (geometria + segmentos)
    currentIdx: 0,
    
    cameras: {
        seccion: { x: 0, y: 0, zoom: 1 },
        planta:  { x: 0, y: 0, zoom: 1 },
        perfil:  { x: 0, y: 0, zoom: 1 }
    },
    
    isDragging: false,
    lastMousePos: { x: 0, y: 0 },
    lastClick: null,
    transform: { minX: 0, minY: 0, scale: 1, mx: 0, my: 0 }
};

function syncAllViews() {
    // Si no hay secciones, no podemos sincronizar el slider
    if (!appState.secciones || !appState.secciones[appState.currentIdx]) {
        // Pero si hay planta, podemos dibujarla igual
        if (appState.planta && typeof dibujarPlanta === 'function') dibujarPlanta();
        return;
    }
    
    const seccionActual = appState.secciones[appState.currentIdx];
    
    const kmInput = document.getElementById('kmInput');
    if (kmInput && document.activeElement !== kmInput) {
        const m = seccionActual.k || seccionActual.km || 0;
        const km = Math.floor(m / 1000);
        const rest = (m % 1000).toFixed(2).padStart(6, '0');
        kmInput.value = `${km}+${rest}`;
    }

    if (typeof dibujarSeccion === 'function') dibujarSeccion(seccionActual);
    if (typeof dibujarPlanta === 'function') dibujarPlanta(); // Planta ahora usa el estado global
    if (typeof dibujarPerfil === 'function') dibujarPerfil(seccionActual);
}