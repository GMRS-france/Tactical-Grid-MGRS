const CACHE_NAME = 'tactical-mgrs-cache-v1';

// Fichiers de base de l'application à mettre en cache immédiatement à l'installation
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/mgrs@1.0.0/dist/mgrs.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-marker.png',
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activation et nettoyage des anciens caches éventuels
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Interception des requêtes réseau (Stratégie Cache First avec mise en cache dynamique)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // On applique cette stratégie pour les tuiles de cartes (OSM, IGN, Esri) et les scripts externes
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Retourne la ressource depuis le cache si elle existe
                return cachedResponse;
            }

            // Sinon, on va la chercher sur le réseau et on la met en cache pour la prochaine fois
            return fetch(event.request).then((response) => {
                // On vérifie si la réponse est valide
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(() => {
                // En cas d'échec total (hors ligne et pas dans le cache), on peut renvoyer quelque chose de neutre si besoin
                if (event.request.destination === 'image') {
                    // Optionnel : tu pourrais renvoyer une image vide ou de substitution
                }
            });
        })
    );
});
