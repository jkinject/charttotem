// 앱 셸을 캐시해서 오프라인에서도 열리게 한다. 기기(http://192.168.x.x) 요청은 건드리지 않는다.
const CACHE = "charttotem-v0.4.0";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // 기기 요청 등은 통과
  // 앱 셸: 네트워크 우선(업데이트 반영), 실패하면 캐시(오프라인)
  e.respondWith(
    fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
