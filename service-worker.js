const CACHE_NAME = 'school-manager-shell-v1';
const APP_SHELL = [
  '/login.html',
  '/index.html',
  '/src/styles.css',
  '/src/login.js',
  '/src/app.js',
  '/manifest.webmanifest',
  '/icons/app-icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache API requests or non-GET requests: school records must stay fresh.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && (url.pathname.startsWith('/src/') || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/'))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('/login.html') : Response.error()))));
});
