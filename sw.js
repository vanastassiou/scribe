const CACHE_NAME = 'scribe-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/db.js',
  '/js/schemas.js',
  '/js/tags.js',
  '/js/sync.js',
  '/js/oauth.js',
  '/js/components/idea-form.js',
  '/js/components/idea-list.js',
  '/js/components/idea-panel.js',
  '/js/components/tag-input.js',
  '/js/components/file-picker.js',
  '/js/components/settings.js',
  '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API calls: network-first
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('dropbox.com') ||
      url.hostname.includes('api.')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) {
          // Return cached, but update in background
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, response));
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone));
            }
            return response;
          });
      })
  );
});

// Handle share target
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST' &&
      new URL(event.request.url).pathname === '/share') {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const data = {
          title: formData.get('title') || '',
          text: formData.get('text') || '',
          url: formData.get('url') || '',
          files: formData.getAll('files')
        };

        // Store in a temporary location for the app to pick up
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.postMessage({ type: 'share-target', data });
        }

        // Redirect to app
        return Response.redirect('/?shared=1', 303);
      })()
    );
  }
});

// Sync event for background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-ideas') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' })
        .then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: 'trigger-sync' });
          }
        })
    );
  }
});
