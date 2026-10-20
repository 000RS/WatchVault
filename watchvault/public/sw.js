// WatchVault service worker: opens instantly and offline, and shows new-episode notifications.
const VERSION = 'wv-v4';
const SHELL = ['/', '/list', '/explore', '/stats', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== `${VERSION}-img`).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache data: the list, the catalogue, AI, auth.
  if (url.pathname.startsWith('/api/') || url.hostname.endsWith('supabase.co') || url.hostname === 'graphql.anilist.co') return;

  // Pages: network first, fall back to the cached copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }
  // Built files never change: cache first.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => (caches.open(VERSION).then((c) => c.put(req, res.clone())), res))));
    return;
  }
  // Posters: cache as they're seen (capped), so the list looks right offline.
  if (url.hostname === 'image.tmdb.org' || url.hostname.endsWith('anili.st')) {
    e.respondWith(
      caches.open(`${VERSION}-img`).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req).catch(() => null);
        if (res && (res.ok || res.type === 'opaque')) {
          c.put(req, res.clone());
          c.keys().then((k) => k.length > 600 && c.delete(k[0]));
        }
        return res || Response.error();
      })
    );
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data.json();
  } catch {
    d = { title: 'WatchVault', body: e.data?.text() || '' };
  }
  e.waitUntil(self.registration.showNotification(d.title || 'WatchVault', { body: d.body || '', icon: d.icon || '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' }, tag: d.tag }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) return open.navigate(url).then((c) => c?.focus());
      return self.clients.openWindow(url);
    })
  );
});
