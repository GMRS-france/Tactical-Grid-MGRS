const cacheName = 'mgrs-france-v2';
const assets = ['index.html'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(response => {
            return response || fetch(e.request).then(res => {
                if (e.request.url.includes('tile.openstreetmap.org')) {
                    caches.open(cacheName).then(cache => {
                        cache.put(e.request, res.clone());
                    });
                }
                return res;
            }).catch(() => {});
        })
    );
});
