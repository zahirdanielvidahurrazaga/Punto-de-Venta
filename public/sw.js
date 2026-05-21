// Basic Service Worker for PWA
const CACHE_NAME = 'pos-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple fetch handler to make it installable
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline support not fully implemented yet.');
    })
  );
});
