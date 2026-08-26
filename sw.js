// BYD Skyrail web Service Worker retirement shim.
// Offline-first on Android is provided by the packaged Capacitor app and local storage,
// so the browser preview must not retain a Service Worker that can mix old and new assets.

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('byd-skyrail-')) await caches.delete(key);
    }
    await self.registration.unregister();
  })());
});

// Intentionally no fetch handler: every request falls through to the network/runtime.
