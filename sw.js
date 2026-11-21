const shellCache = 'scorelens-phone-shell-dcd32067b86f4f91'
const scope = self.registration.scope
const scopePath = new URL(scope).pathname
const shellFiles = ["index.html", "manifest.webmanifest", "app/dcd32067b86f4f91/app.js", "app/dcd32067b86f4f91/capture.js", "app/dcd32067b86f4f91/device-scan.js", "app/dcd32067b86f4f91/example.json", "app/dcd32067b86f4f91/follow.css", "app/dcd32067b86f4f91/follow.js", "app/dcd32067b86f4f91/grain.png", "app/dcd32067b86f4f91/icon-192.png", "app/dcd32067b86f4f91/icon-512.png", "app/dcd32067b86f4f91/icons.js", "app/dcd32067b86f4f91/key-reading.js", "app/dcd32067b86f4f91/keys.js", "app/dcd32067b86f4f91/listen.js", "app/dcd32067b86f4f91/morning-walk.png", "app/dcd32067b86f4f91/pdf-library.js", "app/dcd32067b86f4f91/practice.js", "app/dcd32067b86f4f91/score-conversion.js", "app/dcd32067b86f4f91/style.css", "app/dcd32067b86f4f91/teacher.js", "app/dcd32067b86f4f91/note-study.js", "app/dcd32067b86f4f91/rhythm-study.js", "app/dcd32067b86f4f91/fonts/DMSerifText.ttf", "app/dcd32067b86f4f91/fonts/InstrumentSans.ttf", "app/dcd32067b86f4f91/scales/a-flat-major.svg", "app/dcd32067b86f4f91/scales/a-flat-minor.svg", "app/dcd32067b86f4f91/scales/a-major.svg", "app/dcd32067b86f4f91/scales/a-minor.svg", "app/dcd32067b86f4f91/scales/a-sharp-minor.svg", "app/dcd32067b86f4f91/scales/b-flat-major.svg", "app/dcd32067b86f4f91/scales/b-flat-minor.svg", "app/dcd32067b86f4f91/scales/b-major.svg", "app/dcd32067b86f4f91/scales/b-minor.svg", "app/dcd32067b86f4f91/scales/c-flat-major.svg", "app/dcd32067b86f4f91/scales/c-major.svg", "app/dcd32067b86f4f91/scales/c-minor.svg", "app/dcd32067b86f4f91/scales/c-sharp-major.svg", "app/dcd32067b86f4f91/scales/c-sharp-minor.svg", "app/dcd32067b86f4f91/scales/d-flat-major.svg", "app/dcd32067b86f4f91/scales/d-major.svg", "app/dcd32067b86f4f91/scales/d-minor.svg", "app/dcd32067b86f4f91/scales/d-sharp-minor.svg", "app/dcd32067b86f4f91/scales/e-flat-major.svg", "app/dcd32067b86f4f91/scales/e-flat-minor.svg", "app/dcd32067b86f4f91/scales/e-major.svg", "app/dcd32067b86f4f91/scales/e-minor.svg", "app/dcd32067b86f4f91/scales/f-major.svg", "app/dcd32067b86f4f91/scales/f-minor.svg", "app/dcd32067b86f4f91/scales/f-sharp-major.svg", "app/dcd32067b86f4f91/scales/f-sharp-minor.svg", "app/dcd32067b86f4f91/scales/g-flat-major.svg", "app/dcd32067b86f4f91/scales/g-major.svg", "app/dcd32067b86f4f91/scales/g-minor.svg", "app/dcd32067b86f4f91/scales/g-sharp-minor.svg", "app/dcd32067b86f4f91/rhythm-notation/accidentals.svg", "app/dcd32067b86f4f91/rhythm-notation/expression.svg", "app/dcd32067b86f4f91/rhythm-notation/four-four.svg", "app/dcd32067b86f4f91/rhythm-notation/rests.svg", "app/dcd32067b86f4f91/rhythm-notation/six-eight.svg", "app/dcd32067b86f4f91/rhythm-notation/swing.svg", "app/dcd32067b86f4f91/rhythm-notation/three-four.svg", "app/dcd32067b86f4f91/rhythm-notation/ties.svg", "app/dcd32067b86f4f91/rhythm-notation/triplets.svg", "app/dcd32067b86f4f91/setup.js", "app/dcd32067b86f4f91/pack-info.js"].map(path => new URL(path, scope).href)
const index = new URL('index.html', scope).href

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(index, { cache: 'reload' })
    if (!response.ok || !(await response.clone().text()).includes('src="./app/dcd32067b86f4f91/app.js"')) {
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
  if (request.headers.has('Range')) return
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
