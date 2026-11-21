const CACHE = 'kc0ver-site-v6';
const ASSETS = ['./', './index.html', './ada.html', './dawn-pro2-filter.html', './pattern-lock-demo.html', './styles.css', './app.js', './manifest.json', './icons/icon.svg', './vendor/win95/win95.css', './vendor/win95/win95.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(respond(req));
});

async function respond(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  // HTML 走网络优先，断网时回退缓存
  if (req.mode === 'navigate') return (await network) || cached || Response.error();

  // 静态资源先返回缓存，同时在后台更新，避免忘记升级缓存版本导致长期发旧内容
  return cached || (await network) || Response.error();
}
