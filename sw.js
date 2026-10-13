const CACHE_NAME = "apna-khata-v1";
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
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
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
  if (e.request.url.includes("/rest/v1/")) {
    return; // Do not cache dynamic database API calls
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
