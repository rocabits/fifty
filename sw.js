var CACHE_NAME = 'fifty-v1';
var URLS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './config.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request);
    })
  );
});
