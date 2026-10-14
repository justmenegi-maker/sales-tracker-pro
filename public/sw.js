// Service Worker for SK Tapri Daily Sales Report PWA
const CACHE_NAME = "sktapri-v1";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/pwa-maskable-512x512.png",
  "/apple-touch-icon.png",
  "/icon.svg",
];

// Install event: Precache core static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event: Clean up old caches & take control immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch event: Network-first for dynamic & API; cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Bypass Firestore, Google Auth, and external API requests (always network live)
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("google.com") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Static assets (images, fonts, manifests) -> Cache First with Network Fallback
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf|css)$/) ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidate in background
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // HTML Navigation pages -> Network First with Cache Fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return the cached root shell as offline fallback
          const rootCached = await caches.match("/");
          if (rootCached) {
            return rootCached;
          }
          return new Response(
            "<!DOCTYPE html><html><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>SK Tapri is currently offline</h2><p>Please check your internet connection.</p></body></html>",
            { headers: { "Content-Type": "text/html" } }
          );
        })
    );
    return;
  }

  // Default network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
