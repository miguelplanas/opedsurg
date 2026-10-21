// Service worker de Opo Tests: la app y las preguntas funcionan sin conexión.
// - Abrir la app (navegación a /): primero la red, con 3 s de margen; sin red,
//   la copia guardada. Así una sesión caducada lleva a la pantalla de entrar
//   en vez de quedarse para siempre en una copia vieja.
// - Lo demás (JS, CSS, preguntas): de la caché al momento y se refresca por
//   detrás, así una versión nueva llega sin cambiar nada aquí.
// Solo se guardan respuestas buenas: una redirección a /login o un 401 no
// pisan la app guardada.
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
  if (e.request.mode === 'navigate') {
    // Las rutas son hashes: la única página es /. Otra URL abierta a mano
    // (un .json, un .js) va a la red sin tocar la caché.
    if (url.pathname !== '/' && url.pathname !== '/index.html') return;
    e.respondWith(openApp(e));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    const network = fetch(e.request).then((res) => {
      if (good(res)) cache.put(e.request, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(network.catch(() => {}));
      return cached;
    }
    return network;
  })());
});

async function openApp(e) {
  const cache = await caches.open(CACHE);
  const network = fetch(e.request).then((res) => {
    if (good(res)) cache.put('/', res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    // La red gana si contesta a tiempo, también con la redirección a /login.
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // sin red: la copia guardada
  }
  e.waitUntil(network.catch(() => {}));
  return (await cache.match('/')) ?? network;
}
