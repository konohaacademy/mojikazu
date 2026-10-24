// もじかずクイズ — まず取りに行き、つながらないときだけ しまったものを出す。
// ⚠ しまったものを先に出すと、直した index.html や words.json が子どもの端末に届かなくなる。
var CACHE = 'mojikazu-v1';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (ca) { ca.put(e.request, c); }); }
    return r;
  }).catch(function () { return caches.match(e.request); }));
});
