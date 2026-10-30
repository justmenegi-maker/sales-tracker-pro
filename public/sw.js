// Service worker for the SK Tapri PWA.
//
// It exists for the installable-app shell — icons and the manifest — and
// deliberately caches nothing else. The app has no offline mode: every save
// goes straight to Firestore, so a page served from cache looks usable while
// each filing, payment and correction fails. Navigations therefore always go to
// the network, and with no connection the browser shows its own offline page
// rather than a screen that pretends to work.
const CACHE_NAME = "sktapri-static-v2";

// Icons and manifest only. No HTML: a cached document is what made the app look
// usable offline.
const STATIC_ASSETS = [
  "/manifest.json",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/pwa-maskable-512x512.png",
  "/apple-touch-icon.png",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // One missing icon must not fail the whole install, so each asset is
        // cached on its own.
        Promise.all(
          STATIC_ASSETS.map(async (url) => {
            try {
              const response = await fetch(url);
              if (response.ok) await cache.put(url, response);
            } catch {
              // A flaky connection at install time just leaves it uncached.
            }
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Firestore, Firebase Auth and any API call are always live.
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("google.com") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Pages are never served from cache: no offline mode.
  if (request.mode === "navigate") return;

  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/) ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          fetch(request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
              }
            })
            .catch(() => {});
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
