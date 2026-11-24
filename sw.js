
const CACHE = "phone-intel-v1-pages-v5";
const BASE = new URL("./", self.registration.scope);

const ASSETS = [
  "",
  "index.html",
  "css/style.css",
  "css/login-addon.css",
  "js/config.js",
  "js/app.js",
  "manifest.json",
  "assets/icon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/favicon-32.png"
].map(path => new URL(path, BASE).toString());

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

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

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const networkFirst =
    event.request.mode === "navigate" ||
    /\.(html|js|css)$/.test(url.pathname);

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE).then(cache =>
              cache.put(event.request, response.clone())
            );
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(response =>
            response ||
            caches.match(new URL("index.html", BASE).toString())
          )
        )
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached ||
        fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE).then(cache =>
              cache.put(event.request, response.clone())
            );
          }
          return response;
        })
      )
    );
  }
});
