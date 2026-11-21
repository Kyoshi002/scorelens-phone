const shellCache = 'scorelens-phone-shell-ac3a751ab310bcf3'
const scope = self.registration.scope
const scopePath = new URL(scope).pathname
const shellFiles = ["index.html", "manifest.webmanifest", "app/ac3a751ab310bcf3/app.js", "app/ac3a751ab310bcf3/capture.js", "app/ac3a751ab310bcf3/device-scan.js", "app/ac3a751ab310bcf3/example.json", "app/ac3a751ab310bcf3/follow.css", "app/ac3a751ab310bcf3/follow.js", "app/ac3a751ab310bcf3/grain.png", "app/ac3a751ab310bcf3/icon-192.png", "app/ac3a751ab310bcf3/icon-512.png", "app/ac3a751ab310bcf3/icons.js", "app/ac3a751ab310bcf3/key-reading.js", "app/ac3a751ab310bcf3/keys.js", "app/ac3a751ab310bcf3/listen.js", "app/ac3a751ab310bcf3/morning-walk.png", "app/ac3a751ab310bcf3/pdf-library.js", "app/ac3a751ab310bcf3/practice.js", "app/ac3a751ab310bcf3/score-conversion.js", "app/ac3a751ab310bcf3/style.css", "app/ac3a751ab310bcf3/teacher.js", "app/ac3a751ab310bcf3/fonts/DMSerifText.ttf", "app/ac3a751ab310bcf3/fonts/InstrumentSans.ttf", "app/ac3a751ab310bcf3/scales/a-flat-major.svg", "app/ac3a751ab310bcf3/scales/a-flat-minor.svg", "app/ac3a751ab310bcf3/scales/a-major.svg", "app/ac3a751ab310bcf3/scales/a-minor.svg", "app/ac3a751ab310bcf3/scales/a-sharp-minor.svg", "app/ac3a751ab310bcf3/scales/b-flat-major.svg", "app/ac3a751ab310bcf3/scales/b-flat-minor.svg", "app/ac3a751ab310bcf3/scales/b-major.svg", "app/ac3a751ab310bcf3/scales/b-minor.svg", "app/ac3a751ab310bcf3/scales/c-flat-major.svg", "app/ac3a751ab310bcf3/scales/c-major.svg", "app/ac3a751ab310bcf3/scales/c-minor.svg", "app/ac3a751ab310bcf3/scales/c-sharp-major.svg", "app/ac3a751ab310bcf3/scales/c-sharp-minor.svg", "app/ac3a751ab310bcf3/scales/d-flat-major.svg", "app/ac3a751ab310bcf3/scales/d-major.svg", "app/ac3a751ab310bcf3/scales/d-minor.svg", "app/ac3a751ab310bcf3/scales/d-sharp-minor.svg", "app/ac3a751ab310bcf3/scales/e-flat-major.svg", "app/ac3a751ab310bcf3/scales/e-flat-minor.svg", "app/ac3a751ab310bcf3/scales/e-major.svg", "app/ac3a751ab310bcf3/scales/e-minor.svg", "app/ac3a751ab310bcf3/scales/f-major.svg", "app/ac3a751ab310bcf3/scales/f-minor.svg", "app/ac3a751ab310bcf3/scales/f-sharp-major.svg", "app/ac3a751ab310bcf3/scales/f-sharp-minor.svg", "app/ac3a751ab310bcf3/scales/g-flat-major.svg", "app/ac3a751ab310bcf3/scales/g-major.svg", "app/ac3a751ab310bcf3/scales/g-minor.svg", "app/ac3a751ab310bcf3/scales/g-sharp-minor.svg", "app/ac3a751ab310bcf3/setup.js", "app/ac3a751ab310bcf3/pack-info.js"].map(path => new URL(path, scope).href)
const index = new URL('index.html', scope).href

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(index, { cache: 'reload' })
    if (!response.ok || !(await response.clone().text()).includes('src="./app/ac3a751ab310bcf3/app.js"')) {
      throw new Error('The release index is not available yet.')
    }
    const cache = await caches.open(shellCache)
    await cache.addAll(shellFiles.filter(url => url !== index).map(url => new Request(url, { cache: 'reload' })))
    await cache.put(index, response)
  })())
})
self.addEventListener('activate', event => {
  // Another tab may still be reading with the previous app and scanner pack.
  // Immutable versioned paths can keep serving it after we take control.
  event.waitUntil(self.clients.claim())
})
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})
self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return
  const relative = new URL(request.url).pathname.slice(scopePath.length)
  const versioned = /^(packs|app)\/([\da-f]{16})\//.exec(relative)
  if (versioned) {
    const kind = versioned[1] === 'packs' ? 'pack' : 'shell'
    const cacheName = 'scorelens-phone-' + kind + '-' + versioned[2]
    event.respondWith((async () => (await caches.match(request, { cacheName, ignoreSearch: true })) || fetch(request))())
  } else if (request.mode === 'navigate' && (relative === '' || relative === 'index.html')) {
    event.respondWith((async () => (await caches.match(index, { cacheName: shellCache })) || fetch(request))())
  } else if (shellFiles.includes(request.url)) {
    event.respondWith((async () => (await caches.match(request, { cacheName: shellCache })) || fetch(request))())
  }
})
