/*
 * Service worker dell'iPod: permette di aprire l'app anche senza connessione.
 * - Pagina (index.html): prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
 * - File dell'app (JS, CSS, font, icone): prima la copia salvata. I nomi contengono un hash,
 *   quindi una nuova versione ha file con nomi nuovi e non c'è rischio di usare file vecchi.
 * La musica dell'utente NON passa da qui: resta nei file locali che ha scelto.
 */
// Il numero cambia quando cambiano le icone: così iPhone e browser scaricano quelle nuove.
const CACHE = 'ipod-v2'
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon-v2.svg', './icon-192-v2.png', './icon-512-v2.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ipod-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Solo le richieste sotto il proprio scope (/Denis/ipod/): il sito radice (/Denis/) ha un altro service worker con la sua cache e non va toccato.
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy))
          return response
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
