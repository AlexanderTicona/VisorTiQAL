// Archivo: sw.js
const CACHE_NAME = 'tiqal-v1.7'; // Cambia esto a v1.8 cuando hagas cambios en el código
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/state.js',
  './js/main.js',
  './js/seccion.js',
  './js/planta.js',
  './js/perfil.js'
  
];

// 1. Instalación: Guarda los archivos en el dispositivo
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// 2. Activación: Borra la caché de versiones anteriores automáticamente
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// 3. Estrategia: Primero Caché, si no hay, busca en Red
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});