// Service Worker for Apna Khata Advance - Network First Strategy for Fresh Updates
const CACHE_NAME = "apna-khata-v2";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "manifest.webmanifest",
  "app-icon-192.png",
  "app-icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Never intercept or cache Supabase database API calls
  if (e.request.url.includes("/rest/v1/")) {
    return;
  }

  // Network-First strategy: Always fetch fresh HTML & JS from server, fallback to cache if offline
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (e.request.mode === "navigate") {
            return caches.match("index.html");
          }
          return null;
        });
      })
  );
});
