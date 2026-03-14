// ============================================================
// SERVICE WORKER — Vignesh Investment Portfolio PWA
// ============================================================

const CACHE_NAME = 'portfolio-v1';
const BASE = '/Vignesh_InvestmentPortfolio';
const STATIC_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/app.js',
  BASE + '/style.css',
  BASE + '/manifest.json',
  BASE + '/portfolio.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Add each asset individually so one failure doesn't break all
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(e => console.warn('Cache miss:', url)))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Let API calls go straight to network — never cache these
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('api.github.com') ||
      url.hostname.includes('mfapi.in') ||
      url.hostname.includes('finance.yahoo.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => caches.match(BASE + '/index.html'))
  );
});
