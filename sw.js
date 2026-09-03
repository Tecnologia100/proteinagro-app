// ==============================================================================
// SERVICE WORKER PARA PROTEINAGRO PWA
// Cache del App Shell con estrategia Network-First y Fallback a Cache Offline
// ==============================================================================

const CACHE_NAME = 'proteinagro-v1.2.7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.png'
];

// Instalación: Pre-cache del App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-cacheando App Shell de ProteinAgro');
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Advertencia pre-cacheando recursos:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación: Limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción de Peticiones: Network-First con Fallback a Cache
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Solo procesar peticiones GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignorar peticiones a Google Apps Script Webhooks y Firebase (manejan su propia persistencia)
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com')
  ) {
    return;
  }

  // Estrategia Network-First para App Shell y assets locales
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        // Si la respuesta es válida y del mismo origen, actualizar la caché
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Fallback a caché si no hay conexión a internet
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Si es una navegación y falló todo, retornar la página principal
        if (req.mode === 'navigate') {
          const fallbackIndex = await caches.match('/index.html') || await caches.match('/');
          if (fallbackIndex) return fallbackIndex;
        }

        return new Response('Sin conexión a internet. Recurso no disponible offline.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
        });
      })
  );
});
