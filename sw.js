
const CACHE = "phone-intel-v3";

const BASE = new URL("./", self.registration.scope);

const CORE_ASSETS = [
  "",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/app.js",
  "manifest.json",
  "assets/icon.svg"
].map(path => new URL(path, BASE).toString());

// ==========================================
// INSTALL
// ==========================================

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
  );

  self.skipWaiting();
});

// ==========================================
// ACTIVATE
// ==========================================

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// ==========================================
// NETWORK FIRST - CORE FILES
// ==========================================

async function networkFirst(request) {

  const cache = await caches.open(CACHE);

  try {

    const freshRequest = new Request(request, {
      cache: "no-store"
    });

    const response = await fetch(freshRequest);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;

  } catch (error) {

    const cached = await cache.match(request);

    if (cached) return cached;

    throw error;
  }
}

// ==========================================
// CACHE FIRST - STATIC ASSETS
// ==========================================

async function cacheFirst(request) {

  const cached = await caches.match(request);

  if (cached) return cached;

  const response = await fetch(request);

  if (response && response.ok) {

    const cache = await caches.open(CACHE);

    await cache.put(request, response.clone());
  }

  return response;
}

// ==========================================
// FETCH
// ==========================================

self.addEventListener("fetch", event => {

  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Jangan cache API atau domain eksternal
  if (url.origin !== self.location.origin) return;

  // File inti: selalu cek versi jaringan terlebih dahulu
  const isCoreFile = CORE_ASSETS.includes(url.href);

  if (isCoreFile || request.mode === "navigate") {

    event.respondWith(
      networkFirst(request).catch(() =>
        caches.match(
          new URL("index.html", BASE).toString()
        )
      )
    );

    return;
  }

  // Aset lainnya
  event.respondWith(
    cacheFirst(request).catch(() =>
      caches.match(
        new URL("index.html", BASE).toString()
      )
    )
  );

});
