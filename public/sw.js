const CACHE_VER = 'pvs-v1'
const STATIC_CACHE = CACHE_VER + '-static'
const PAGE_CACHE = CACHE_VER + '-pages'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.add('/offline'))
      .catch(() => null)
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VER))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/data/')) return

  // Immutable hashed assets — cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()))
          }
          return res
        })
      })
    )
    return
  }

  // HTML pages — network-first, fall back to cache, then offline page
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          caches.open(PAGE_CACHE).then((c) => c.put(request, res.clone()))
        }
        return res
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/offline'))
      )
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
