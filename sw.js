const CACHE_NAME = 'viki-mobile-v3';
const APP_SHELL = ['./', './index.html', './viki-personality.js', './viki-storage.js', './viki-notifications.js', './manifest.json', './mobile-ui.css', './mobile-ui.js', './viki-inbox.js', './viki-help.js', './viki-data.js'];
const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('viki-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    // Never cache authenticated API responses, remote integrations, or arbitrary URLs.
    if (event.request.method !== 'GET' || !SHELL_URLS.has(event.request.url)) return;
    event.respondWith(fetch(event.request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
        }
        return response;
    }).catch(() => caches.match(event.request)));
});
