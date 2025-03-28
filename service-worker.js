const CACHE_SITE_SIGN_IN = 'site-sign-in-cache-v59';
const CACHE_DEER_CULL = 'deer-cull-cache-v59';
const CACHE_OBSERVATIONS = 'observations-cache-v59';
const GENERAL_CACHE = 'general-cache-v59';

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(GENERAL_CACHE).then((cache) => {
                return cache.addAll([
                    '/',
                    '/index.html',
                    '/index_page.html',
                    '/style.css',
                    '/login.js',
                    '/index.js',
                    '/manifest.json',
                    '/icons/icon-192x192.png',
                    '/icons/icon-512x512.png',
                    '/icons/Binoculars.png',
                    '/icons/Deer.png',
                    '/icons/Home.png',
                    '/icons/Site.png',
                ]);
            }),
            caches.open(CACHE_SITE_SIGN_IN).then((cache) => {
                return cache.addAll([
                    '/site_sign_in.html',
                    '/site_sign_in.js',
                    '/style.css',
                    '/manifest.json',
                    '/icons/icon-192x192.png',
                    '/icons/icon-512x512.png',
                    '/icons/Binoculars.png',
                    '/icons/Deer.png',
                    '/icons/Home.png',
                    '/icons/Site.png',
                ]);
            }),
            caches.open(CACHE_DEER_CULL).then((cache) => {
                return cache.addAll([
                    '/deer_cull_submissions.html',
                    '/deer_cull_submissions.js',
                    '/style.css',
                    '/manifest.json',
                    '/icons/icon-192x192.png',
                    '/icons/icon-512x512.png',
                    '/icons/Binoculars.png',
                    '/icons/Deer.png',
                    '/icons/Home.png',
                    '/icons/Site.png',
                ]);
            }),
            caches.open(CACHE_OBSERVATIONS).then((cache) => {
                return cache.addAll([
                    '/observations.html',
                    '/observations.js',
                    '/style.css',
                    '/manifest.json',
                    '/icons/icon-192x192.png',
                    '/icons/icon-512x512.png',
                    '/icons/Binoculars.png',
                    '/icons/Deer.png',
                    '/icons/Home.png',
                    '/icons/Site.png',
                ]);
            }),
        ])
    );
    self.skipWaiting(); // Activate new service worker immediately
});

// Fetch event
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    const noCacheEndpoints = [
        'https://script.google.com/macros/s/AKfycbw45LpKks49YpqIMLy9wZiLwPKP5buMJ9eTKr3dla20CFPlGekrpFEC9mL9RnqRJBE6jQ/exec'
    ];

    // Check if the request should bypass cache
    if (noCacheEndpoints.some(endpoint => requestUrl.href.includes(endpoint))) {
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                return networkResponse;
            }).catch(() => {
                return new Response('Network error', { status: 503 });
            })
        );
        return;
    }

    let cacheName = GENERAL_CACHE;

    if (requestUrl.pathname.includes('/site_sign_in')) {
        cacheName = CACHE_SITE_SIGN_IN;
    } else if (requestUrl.pathname.includes('/deer_cull_submissions')) {
        cacheName = CACHE_DEER_CULL;
    } else if (requestUrl.pathname.includes('/observations')) {
        cacheName = CACHE_OBSERVATIONS;
    }

    event.respondWith(
        caches.open(cacheName).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request).then((networkResponse) => {
                    cache.put(event.request, networkResponse.clone());
                    // Notify clients when new submissions are saved
                    self.clients.matchAll().then((clients) => {
                        clients.forEach((client) => {
                            client.postMessage({ type: 'STORAGE_UPDATED' });
                        });
                    });
                    return networkResponse;
                });
            });
        }).catch(() => caches.match('/index.html')) // Fallback to index.html if offline
    );
});


// Activate event
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_SITE_SIGN_IN, CACHE_DEER_CULL, CACHE_OBSERVATIONS, GENERAL_CACHE];
    event.waitUntil(
        caches.keys().then((cacheNames) => 
            Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            )
        ).then(() => self.clients.claim()) // Take control of all clients
    );
});

// Background sync registration
async function registerSync(tag) {
    try {
        const registration = await self.registration.sync.register(tag);
        console.log(`Sync registered for ${tag}:`, registration);
    } catch (error) {
        console.error(`Sync registration failed for ${tag}:`, error);
    }
}

// Sync event listener
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-site-sign-in') {
        event.waitUntil(syncPendingResponses('site_sign_in_responses'));
    } else if (event.tag === 'sync-deer-cull') {
        event.waitUntil(syncPendingResponses('deer_cull_responses'));
    } else if (event.tag === 'sync-observations') {
        event.waitUntil(syncPendingResponses('observations_responses'));
    }
});

// Sync pending responses
async function syncPendingResponses(storageKey) {
    const scriptURLMap = {
        site_sign_in_responses: "https://script.google.com/macros/s/AKfycbyG0-lJ3fKWjBR0ya74y5V02JkDBsZuVdRXTTxU375TQcSNU_41JT8VSGSYbHj-5-js/exec",
        deer_cull_responses: "https://script.google.com/macros/s/AKfycbz7R7FuRXu4qi_cQd_Rg5sZY-D6pMEVRHol0FQRNuKXbR3MtXau6cnBuDpRxFAaozc/exec",
        observations_responses: "https://script.google.com/macros/s/AKfycbywWOzFRrkypAlrbHhdBid60QTn1EurJ7Ko-hnMK3T9iy4nrtyabg6bOqoGrgBMXNDQ/exec"
    };

    const scriptURL = scriptURLMap[storageKey];
    const responses = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (responses.length === 0) {
        console.log(`No pending submissions for ${storageKey}.`);
        return;
    }

    const unsyncedResponses = [];
    for (const response of responses) {
        try {
            const networkResponse = await fetch(scriptURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(response),
            });

            if (!networkResponse.ok) {
                throw new Error(`Network error: ${networkResponse.statusText}`);
            }

            const serverResponse = await networkResponse.json();
            if (serverResponse.status !== "success") {
                throw new Error(`Server error: ${serverResponse.message}`);
            }
        } catch (error) {
            console.error(`Error syncing response for ${storageKey}:`, error);
            unsyncedResponses.push(response);
        }
    }

    if (unsyncedResponses.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(unsyncedResponses));
        console.log(`${unsyncedResponses.length} responses could not be synced.`);
    } else {
        localStorage.removeItem(storageKey);
        console.log(`All responses for ${storageKey} have been synced.`);
    }
}

// Trigger sync when back online
self.addEventListener('online', () => {
    registerSync('sync-site-sign-in');
    registerSync('sync-deer-cull');
    registerSync('sync-observations');
});

// Handle PWA installation prompt
self.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.deferredPrompt = event;
});
