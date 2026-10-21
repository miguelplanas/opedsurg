// Service worker de Opo Tests: la app y las preguntas funcionan sin conexión.
// Todo se sirve de la caché al momento y se refresca por detrás, así una
// versión nueva llega en la siguiente apertura sin tener que cambiar nada aquí.
// Solo se guardan respuestas buenas: si la sesión caducó, la red devuelve la
// pantalla de entrar (una redirección) y eso no debe pisar la app guardada.
const CACHE = 'opo-tests-v1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/favicon.svg?v=2',
  '/css/base.css', '/css/app.css',
  '/fonts/host-grotesk.woff2', '/fonts/plex-mono-400.woff2', '/fonts/plex-mono-500.woff2',
  '/js/theme.js', '/js/app.js', '/js/nav.js', '/js/ui.js', '/js/dataset.js', '/js/quiz.js',
  '/js/progress.js', '/js/run.js',
  '/js/views/home.js', '/js/views/exams.js', '/js/views/setup.js', '/js/views/runner.js',
  '/js/views/results.js', '/js/views/stats.js',
  '/data/manifest.json',
];

const good = (res) => res && res.ok && !res.redirected && res.type === 'basic';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Todas las convocatorias, para poder hacer simulacros sin red.
    const manifest = await (await cache.match('/data/manifest.json')).json();
    await cache.addAll(manifest.exams.map((ex) => `/data/exams/${encodeURIComponent(ex.id)}.json`));
    await self.skipWaiting();
  })());
});

// Borra las cachés de otras versiones, incluida la de la app anterior en React.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname === '/login') return;
  // Las rutas son hashes, así que toda navegación es la página principal.
  const key = e.request.mode === 'navigate' ? '/' : e.request;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    const network = fetch(e.request).then((res) => {
      if (good(res)) cache.put(key, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(network.catch(() => {}));
      return cached;
    }
    return network;
  })());
});
