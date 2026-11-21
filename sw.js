const shellCache = 'scorelens-phone-shell-e7ff0642a0b4d5c7'
const scope = self.registration.scope
const scopePath = new URL(scope).pathname
const shellFiles = ["index.html", "manifest.webmanifest", "app/e7ff0642a0b4d5c7/app.js", "app/e7ff0642a0b4d5c7/capture.js", "app/e7ff0642a0b4d5c7/device-scan.js", "app/e7ff0642a0b4d5c7/example.json", "app/e7ff0642a0b4d5c7/follow.css", "app/e7ff0642a0b4d5c7/follow.js", "app/e7ff0642a0b4d5c7/grain.png", "app/e7ff0642a0b4d5c7/icon-192.png", "app/e7ff0642a0b4d5c7/icon-512.png", "app/e7ff0642a0b4d5c7/icons.js", "app/e7ff0642a0b4d5c7/key-reading.js", "app/e7ff0642a0b4d5c7/keys.js", "app/e7ff0642a0b4d5c7/listen.js", "app/e7ff0642a0b4d5c7/morning-walk.png", "app/e7ff0642a0b4d5c7/pdf-library.js", "app/e7ff0642a0b4d5c7/practice.js", "app/e7ff0642a0b4d5c7/score-conversion.js", "app/e7ff0642a0b4d5c7/style.css", "app/e7ff0642a0b4d5c7/teacher.js", "app/e7ff0642a0b4d5c7/note-study.js", "app/e7ff0642a0b4d5c7/rhythm-study.js", "app/e7ff0642a0b4d5c7/fonts/DMSerifText.ttf", "app/e7ff0642a0b4d5c7/fonts/InstrumentSans.ttf", "app/e7ff0642a0b4d5c7/scales/a-flat-major.svg", "app/e7ff0642a0b4d5c7/scales/a-flat-minor.svg", "app/e7ff0642a0b4d5c7/scales/a-major.svg", "app/e7ff0642a0b4d5c7/scales/a-minor.svg", "app/e7ff0642a0b4d5c7/scales/a-sharp-minor.svg", "app/e7ff0642a0b4d5c7/scales/b-flat-major.svg", "app/e7ff0642a0b4d5c7/scales/b-flat-minor.svg", "app/e7ff0642a0b4d5c7/scales/b-major.svg", "app/e7ff0642a0b4d5c7/scales/b-minor.svg", "app/e7ff0642a0b4d5c7/scales/c-flat-major.svg", "app/e7ff0642a0b4d5c7/scales/c-major.svg", "app/e7ff0642a0b4d5c7/scales/c-minor.svg", "app/e7ff0642a0b4d5c7/scales/c-sharp-major.svg", "app/e7ff0642a0b4d5c7/scales/c-sharp-minor.svg", "app/e7ff0642a0b4d5c7/scales/d-flat-major.svg", "app/e7ff0642a0b4d5c7/scales/d-major.svg", "app/e7ff0642a0b4d5c7/scales/d-minor.svg", "app/e7ff0642a0b4d5c7/scales/d-sharp-minor.svg", "app/e7ff0642a0b4d5c7/scales/e-flat-major.svg", "app/e7ff0642a0b4d5c7/scales/e-flat-minor.svg", "app/e7ff0642a0b4d5c7/scales/e-major.svg", "app/e7ff0642a0b4d5c7/scales/e-minor.svg", "app/e7ff0642a0b4d5c7/scales/f-major.svg", "app/e7ff0642a0b4d5c7/scales/f-minor.svg", "app/e7ff0642a0b4d5c7/scales/f-sharp-major.svg", "app/e7ff0642a0b4d5c7/scales/f-sharp-minor.svg", "app/e7ff0642a0b4d5c7/scales/g-flat-major.svg", "app/e7ff0642a0b4d5c7/scales/g-major.svg", "app/e7ff0642a0b4d5c7/scales/g-minor.svg", "app/e7ff0642a0b4d5c7/scales/g-sharp-minor.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/accidentals.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/expression.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/four-four.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/rests.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/six-eight.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/swing.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/three-four.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/ties.svg", "app/e7ff0642a0b4d5c7/rhythm-notation/triplets.svg", "app/e7ff0642a0b4d5c7/setup.js", "app/e7ff0642a0b4d5c7/pack-info.js"].map(path => new URL(path, scope).href)
const index = new URL('index.html', scope).href

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(index, { cache: 'reload' })
    if (!response.ok || !(await response.clone().text()).includes('src="./app/e7ff0642a0b4d5c7/app.js"')) {
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
