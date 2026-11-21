const shellCache = 'scorelens-phone-shell-6eea7dcf8ec4d0b8'
const packCache = 'scorelens-phone-pack-6187d611a092bafb'
const scope = self.registration.scope
const shellFiles = ["index.html", "manifest.webmanifest", "app/6eea7dcf8ec4d0b8/app.js", "app/6eea7dcf8ec4d0b8/capture.js", "app/6eea7dcf8ec4d0b8/device-scan.js", "app/6eea7dcf8ec4d0b8/example.json", "app/6eea7dcf8ec4d0b8/follow.css", "app/6eea7dcf8ec4d0b8/follow.js", "app/6eea7dcf8ec4d0b8/grain.png", "app/6eea7dcf8ec4d0b8/icon-192.png", "app/6eea7dcf8ec4d0b8/icon-512.png", "app/6eea7dcf8ec4d0b8/icons.js", "app/6eea7dcf8ec4d0b8/key-reading.js", "app/6eea7dcf8ec4d0b8/keys.js", "app/6eea7dcf8ec4d0b8/listen.js", "app/6eea7dcf8ec4d0b8/morning-walk.png", "app/6eea7dcf8ec4d0b8/pdf-library.js", "app/6eea7dcf8ec4d0b8/practice.js", "app/6eea7dcf8ec4d0b8/score-conversion.js", "app/6eea7dcf8ec4d0b8/style.css", "app/6eea7dcf8ec4d0b8/teacher.js", "app/6eea7dcf8ec4d0b8/fonts/DMSerifText.ttf", "app/6eea7dcf8ec4d0b8/fonts/InstrumentSans.ttf", "app/6eea7dcf8ec4d0b8/scales/a-flat-major.svg", "app/6eea7dcf8ec4d0b8/scales/a-flat-minor.svg", "app/6eea7dcf8ec4d0b8/scales/a-major.svg", "app/6eea7dcf8ec4d0b8/scales/a-minor.svg", "app/6eea7dcf8ec4d0b8/scales/a-sharp-minor.svg", "app/6eea7dcf8ec4d0b8/scales/b-flat-major.svg", "app/6eea7dcf8ec4d0b8/scales/b-flat-minor.svg", "app/6eea7dcf8ec4d0b8/scales/b-major.svg", "app/6eea7dcf8ec4d0b8/scales/b-minor.svg", "app/6eea7dcf8ec4d0b8/scales/c-flat-major.svg", "app/6eea7dcf8ec4d0b8/scales/c-major.svg", "app/6eea7dcf8ec4d0b8/scales/c-minor.svg", "app/6eea7dcf8ec4d0b8/scales/c-sharp-major.svg", "app/6eea7dcf8ec4d0b8/scales/c-sharp-minor.svg", "app/6eea7dcf8ec4d0b8/scales/d-flat-major.svg", "app/6eea7dcf8ec4d0b8/scales/d-major.svg", "app/6eea7dcf8ec4d0b8/scales/d-minor.svg", "app/6eea7dcf8ec4d0b8/scales/d-sharp-minor.svg", "app/6eea7dcf8ec4d0b8/scales/e-flat-major.svg", "app/6eea7dcf8ec4d0b8/scales/e-flat-minor.svg", "app/6eea7dcf8ec4d0b8/scales/e-major.svg", "app/6eea7dcf8ec4d0b8/scales/e-minor.svg", "app/6eea7dcf8ec4d0b8/scales/f-major.svg", "app/6eea7dcf8ec4d0b8/scales/f-minor.svg", "app/6eea7dcf8ec4d0b8/scales/f-sharp-major.svg", "app/6eea7dcf8ec4d0b8/scales/f-sharp-minor.svg", "app/6eea7dcf8ec4d0b8/scales/g-flat-major.svg", "app/6eea7dcf8ec4d0b8/scales/g-major.svg", "app/6eea7dcf8ec4d0b8/scales/g-minor.svg", "app/6eea7dcf8ec4d0b8/scales/g-sharp-minor.svg", "app/6eea7dcf8ec4d0b8/scales/index.json", "app/6eea7dcf8ec4d0b8/setup.js", "app/6eea7dcf8ec4d0b8/pack-info.js"].map(path => new URL(path, scope).href)
const packBase = new URL('packs/6187d611a092bafb/', scope).href

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache)
    await cache.addAll(shellFiles.map(url => new Request(url, { cache: 'reload' })))
  })())
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('scorelens-phone-shell-') && name !== shellCache) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return
  if (request.url.startsWith(packBase)) {
    event.respondWith((async () => (await caches.match(request, { cacheName: packCache, ignoreSearch: true })) || fetch(request))())
  } else if (request.mode === 'navigate' && new URL(request.url).pathname === new URL(scope).pathname) {
    event.respondWith((async () => (await caches.match(new URL('index.html', scope), { cacheName: shellCache })) || fetch(request))())
  } else if (shellFiles.includes(request.url)) {
    event.respondWith((async () => (await caches.match(request, { cacheName: shellCache })) || fetch(request))())
  }
})
