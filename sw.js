// ============================================================
// SERVICE WORKER — Vignesh Investment Portfolio PWA
// ============================================================

const CACHE_NAME = 'portfolio-v1';
const STATIC_ASSETS = [
  '/Vignesh_InvestmentPortfolio/',
  '/Vignesh_InvestmentPortfolio/index.html',
  '/Vignesh_InvestmentPortfolio/app.js',
  '/Vignesh_InvestmentPortfolio/style.css',
  '/Vignesh_InvestmentPortfolio/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
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

// Fetch — serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Don't cache API calls (live prices, GitHub)
  const url = new URL(event.request.url);
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('api.github.com') ||
      url.hostname.includes('mfapi.in') ||
      url.hostname.includes('finance.yahoo.com')) {
    return; // Let these go straight to network
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          // Cache new static assets
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
      )
      .catch(() => caches.match('/Vignesh_InvestmentPortfolio/index.html'))
  );
});
