const shellCache = 'scorelens-phone-shell-1e1e44027565ad6e'
const scope = self.registration.scope
const scopePath = new URL(scope).pathname
const shellFiles = ["index.html", "manifest.webmanifest", "app/1e1e44027565ad6e/app.js", "app/1e1e44027565ad6e/capture.js", "app/1e1e44027565ad6e/device-scan.js", "app/1e1e44027565ad6e/example.json", "app/1e1e44027565ad6e/follow.css", "app/1e1e44027565ad6e/follow.js", "app/1e1e44027565ad6e/grain.png", "app/1e1e44027565ad6e/icon-192.png", "app/1e1e44027565ad6e/icon-512.png", "app/1e1e44027565ad6e/icons.js", "app/1e1e44027565ad6e/key-reading.js", "app/1e1e44027565ad6e/keys.js", "app/1e1e44027565ad6e/listen.js", "app/1e1e44027565ad6e/morning-walk.png", "app/1e1e44027565ad6e/pdf-library.js", "app/1e1e44027565ad6e/practice.js", "app/1e1e44027565ad6e/score-conversion.js", "app/1e1e44027565ad6e/style.css", "app/1e1e44027565ad6e/teacher.js", "app/1e1e44027565ad6e/note-study.js", "app/1e1e44027565ad6e/rhythm-study.js", "app/1e1e44027565ad6e/fonts/DMSerifText.ttf", "app/1e1e44027565ad6e/fonts/InstrumentSans.ttf", "app/1e1e44027565ad6e/scales/a-flat-major.svg", "app/1e1e44027565ad6e/scales/a-flat-minor.svg", "app/1e1e44027565ad6e/scales/a-major.svg", "app/1e1e44027565ad6e/scales/a-minor.svg", "app/1e1e44027565ad6e/scales/a-sharp-minor.svg", "app/1e1e44027565ad6e/scales/b-flat-major.svg", "app/1e1e44027565ad6e/scales/b-flat-minor.svg", "app/1e1e44027565ad6e/scales/b-major.svg", "app/1e1e44027565ad6e/scales/b-minor.svg", "app/1e1e44027565ad6e/scales/c-flat-major.svg", "app/1e1e44027565ad6e/scales/c-major.svg", "app/1e1e44027565ad6e/scales/c-minor.svg", "app/1e1e44027565ad6e/scales/c-sharp-major.svg", "app/1e1e44027565ad6e/scales/c-sharp-minor.svg", "app/1e1e44027565ad6e/scales/d-flat-major.svg", "app/1e1e44027565ad6e/scales/d-major.svg", "app/1e1e44027565ad6e/scales/d-minor.svg", "app/1e1e44027565ad6e/scales/d-sharp-minor.svg", "app/1e1e44027565ad6e/scales/e-flat-major.svg", "app/1e1e44027565ad6e/scales/e-flat-minor.svg", "app/1e1e44027565ad6e/scales/e-major.svg", "app/1e1e44027565ad6e/scales/e-minor.svg", "app/1e1e44027565ad6e/scales/f-major.svg", "app/1e1e44027565ad6e/scales/f-minor.svg", "app/1e1e44027565ad6e/scales/f-sharp-major.svg", "app/1e1e44027565ad6e/scales/f-sharp-minor.svg", "app/1e1e44027565ad6e/scales/g-flat-major.svg", "app/1e1e44027565ad6e/scales/g-major.svg", "app/1e1e44027565ad6e/scales/g-minor.svg", "app/1e1e44027565ad6e/scales/g-sharp-minor.svg", "app/1e1e44027565ad6e/rhythm-notation/accidentals.svg", "app/1e1e44027565ad6e/rhythm-notation/expression.svg", "app/1e1e44027565ad6e/rhythm-notation/four-four.svg", "app/1e1e44027565ad6e/rhythm-notation/rests.svg", "app/1e1e44027565ad6e/rhythm-notation/six-eight.svg", "app/1e1e44027565ad6e/rhythm-notation/swing.svg", "app/1e1e44027565ad6e/rhythm-notation/three-four.svg", "app/1e1e44027565ad6e/rhythm-notation/ties.svg", "app/1e1e44027565ad6e/rhythm-notation/triplets.svg", "app/1e1e44027565ad6e/setup.js", "app/1e1e44027565ad6e/pack-info.js"].map(path => new URL(path, scope).href)
const index = new URL('index.html', scope).href

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(index, { cache: 'reload' })
    if (!response.ok || !(await response.clone().text()).includes('src="./app/1e1e44027565ad6e/app.js"')) {
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
