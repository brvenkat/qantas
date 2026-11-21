const prefix = 'airport-directory-shell:'
const cacheName = prefix + BUILD_ID
const shell = new URL('./index.html', self.registration.scope).href
const assets = new Set(BUILD_ASSETS.map(path => new URL(path, self.registration.scope).href))

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    await cache.addAll([shell, ...assets])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName)
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    const url = new URL(request.url)
    if (url.pathname === '/' || /^\/airports\/[^/]+\/?$/.test(url.pathname)) {
      // Keep the HTML and precached assets from the same release together.
      event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(shell)) ?? fetch(request)))
    }
  } else if (assets.has(request.url)) {
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(request)) ?? fetch(request)))
  }
})
