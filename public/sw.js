const CACHE = 'claude-journal-v3';
const STATIC = ['/', '/style.css', '/modules/main.js', '/modules/state.js', '/modules/sidebar.js', '/modules/messages.js', '/modules/rail.js', '/modules/notes.js', '/modules/toast.js', '/modules/router.js', '/modules/search.js', '/modules/analytics.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API calls: network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok && e.request.method === 'GET') {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Static: cache first, network fallback
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
