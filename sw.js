// ============================================================
//  BuckBudget Service Worker — sw.js
//  Purpose: Offline support + PWA installability
//  Deploy this file to the ROOT of your Netlify site
//  (same folder as your index.html / BuckBudget HTML file)
// ============================================================

const CACHE_NAME = 'buckbudget-v1';

// Files to cache for offline use.
// '/' assumes your HTML file is served as index.html at the root.
// If your file has a different name on Netlify, add it here too.
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

// ── Install event: cache all core files ──────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // addAll fails silently if any external CDN resource is unavailable —
      // that's fine, the app will still load from network in that case
      return cache.addAll(FILES_TO_CACHE).catch(function(err) {
        console.warn('BuckBudget SW: Some files failed to cache:', err);
      });
    })
  );
  // Take over immediately without waiting for old SW to expire
  self.skipWaiting();
});

// ── Activate event: clean up old caches ──────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keyList) {
      return Promise.all(
        keyList.map(function(key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Claim all open clients immediately
  self.clients.claim();
});

// ── Fetch event: serve from cache, fall back to network ──────
// Strategy: Cache-first for app shell, network-first for everything else
self.addEventListener('fetch', function(event) {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        // Serve from cache (fast, works offline)
        return cachedResponse;
      }
      // Not in cache — fetch from network and optionally cache it
      return fetch(event.request).then(function(networkResponse) {
        // Cache successful responses for future offline use
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function() {
        // Network failed AND not in cache — show offline fallback
        // For now, just return nothing (browser shows its own offline page)
        // You could return a custom offline.html here if you create one
      });
    })
  );
});

// ── Push event: handle incoming push messages (future use) ───
// This is where server-sent push notifications would be received.
// For now, BuckBudget uses in-app scheduled notifications only.
// When you add a push server (see setup guide), messages arrive here.
self.addEventListener('push', function(event) {
  let data = { title: 'BuckBudget', body: 'You have an upcoming bill reminder.' };
  try {
    data = event.data.json();
  } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      tag:   data.tag || 'buckbudget-push'
    })
  );
});

// ── Notification click: open the app when user taps notification
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If app is already open, focus it
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
