const cacheName = 'mgrs-france-v1';
const assets = ['index.html', 'icon.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets))));

self.addEventListener('fetch', e => {
    e.respondWith(caches.match(e.request).then(response => response || fetch(e.request).then(res => {
        if(e.request.url.includes('tile.openstreetmap.org')) {
            caches.open(cacheName).then(cache => cache.put(e.request, res.clone()));
        }
        return res;
    })));
});
