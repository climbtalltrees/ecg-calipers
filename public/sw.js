// Offline support: cache the app shell, serve from cache, refresh in the background.
const CACHE = 'ecg-calipers-v2'
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon.svg'])))
  self.skipWaiting()
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' })
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res }).catch(() => hit || cache.match('/index.html'))
      return hit || net
    })
  )
})
