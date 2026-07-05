// Service Worker — Poultry Vet System
// Strategy:
//   /_next/static/*  → Cache-first (content-hashed, safe forever)
//   Page HTML        → Network-first, fall back to cache, then /offline
//   RSC requests     → Network-first, fall back to cache (enables offline client-nav)
//   /api/*           → Network-only (never cache sensitive data)

const CACHE_VER = 'pvs-v5'
const STATIC_CACHE = CACHE_VER + '-static'
const PAGE_CACHE = CACHE_VER + '-pages'

// Pages to fetch and cache during service worker install.
// These give the user an offline app even before they've visited each page.
const PRECACHE_PAGES = [
  '/',
  '/offline',
  '/sales',
  '/sales/new',
  '/sales/offline',
  '/purchases',
  '/expenses',
  '/customers',
  '/suppliers',
  '/inventory',
  '/accounts',
  '/reports',
]

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then(async (cache) => {
      // Best-effort: if user isn't logged in or network is unavailable, skip
      await Promise.allSettled(
        PRECACHE_PAGES.map((url) =>
          fetch(url, { credentials: 'same-origin', cache: 'no-cache' })
            .then((res) => {
              if (res.ok) cache.put(url, res)
            })
            .catch(() => null)
        )
      )
    }).then(() => self.skipWaiting())
  )
})

// ── Activate ─────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Next.js App Router client-side navigations are RSC requests.
// They share the same URL as the HTML page but carry different headers.
// We cache them separately so both the HTML and the RSC payload are available offline.
function getRSCCacheKey(url) {
  // Use a fragment suffix that won't be sent to the server
  return url.origin + url.pathname + url.search + '#rsc'
}

function isRSCRequest(request) {
  return (
    request.headers.get('Accept')?.includes('text/x-component') ||
    request.headers.get('RSC') === '1' ||
    !!request.headers.get('Next-Router-State-Tree')
  )
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle GET requests from the same origin
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // ── 1. Next.js hashed static assets → Cache-first ────────────────────────
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()))
          }
          return res
        }).catch(() => new Response('', { status: 503 }))
      })
    )
    return
  }

  // ── 2. API routes → Network-only ─────────────────────────────────────────
  // Never cache API responses (auth-sensitive, always needs fresh data).
  // The offline invoice queue is handled client-side in IndexedDB, not here.
  if (url.pathname.startsWith('/api/')) return

  // ── 3. RSC requests → Network-first, RSC cache fallback ──────────────────
  // These are client-side navigation requests (Next.js App Router).
  if (isRSCRequest(request)) {
    const cacheKey = getRSCCacheKey(url)
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            caches.open(PAGE_CACHE).then((c) => c.put(cacheKey, res.clone()))
          }
          return res
        })
        .catch(async () => {
          const cached = await caches.match(cacheKey)
          if (cached) return cached
          // Never return undefined — send the offline page so the user sees
          // something useful instead of a blank screen.
          const offline = await caches.match('/offline')
          return offline || new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        })
    )
    return
  }

  // ── 4. Page HTML → Network-first, page cache fallback, offline fallback ───
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          caches.open(PAGE_CACHE).then((c) => c.put(request, res.clone()))
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        // Last resort: show the offline page
        const offline = await caches.match('/offline')
        return offline || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })
      })
  )
})

// ── Message ───────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
