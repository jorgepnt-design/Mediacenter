/* Mediacenter Service Worker – App-Shell + Laufzeit-Cache fuer die ffmpeg-Cores.
   Es werden keinerlei Nutzerdateien gespeichert oder uebertragen. */
const VERSION = 'mediacenter-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const CORE_CACHE = `${VERSION}-ffmpeg-core`;

const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(SHELL.map((path) => cache.add(new Request(path, { cache: 'reload' })))),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isCore(url) {
  return /ffmpeg-core/.test(url.pathname) || url.pathname.endsWith('.wasm');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ffmpeg-Core (~30 MB): einmal laden, danach dauerhaft aus dem Cache.
  if (isCore(url)) {
    event.respondWith(cacheFirst(request, CORE_CACHE));
    return;
  }

  // Gebuendelte Assets sind content-hashed -> cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Navigationen: Netz zuerst, offline aus dem Shell-Cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request)),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}
