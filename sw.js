// Cache do app no celular: abre rápido e os modelos 3D não são baixados de novo. A versão vem de /sw.js?v=...
const V = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'multipunk-' + V;
const STATIC = /^\/(lib\/|assets\/)/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('multipunk-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  if (STATIC.test(url.pathname)) {                         // modelos, texturas e bibliotecas: cache primeiro
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r;
    }));
    return;
  }
  e.respondWith(fetch(req).then(r => {                     // código do jogo: rede primeiro, cache se estiver sem sinal
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then(h => h || caches.match('/'))));
});
