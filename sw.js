// 앱 셸을 캐시해서 오프라인에서도 열리게 한다. 기기(http://192.168.x.x)·클라우드(workers.dev) 요청은 건드리지 않는다.
const CACHE = "charttotem-v0.9.9";
const SHELL = ["./", "index.html", "style.css", "totems.js", "preview.js", "app.js", "settings-kstock.html", "settings-coin.html", "fonts/tft.json", "fonts/ko24.bin", "fonts/ko14.bin", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png", "icons/home-empty.png", "icons/device.png",
  ...["01-bull", "02-bear", "03-owl", "04-whale", "05-fox", "06-cat", "07-rabbit", "08-penguin", "09-frog", "10-ghost", "11-robot", "12-octopus"].map((f) => `icons/totems/${f}.png`)];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // 기기 요청 등은 통과
  // 제품 소개 사이트(/stock-clock/, /coin-clock/, /site/)와 검색엔진용 파일은 앱 셸이 아니다 → 브라우저가 그대로 받게 둔다.
  // (안 그러면 사진 수 MB 가 앱 캐시에 쌓이고, 오프라인일 때 소개 페이지 주소에 앱 화면이 뜬다) (0.9.9)
  if (/^\/(stock-clock|coin-clock|site)(\/|$)|^\/(robots\.txt|sitemap\.xml)$/.test(url.pathname)) return;
  // 앱 셸: 네트워크 우선(업데이트 반영), 실패하면 캐시(오프라인).
  // GET 은 브라우저 HTTP 캐시를 거치지 않고(no-cache: ETag 로 재검증) 받는다 — 커스텀 도메인(lalatap.kr 존)이 max-age 4시간을 붙여 새 버전이 몇 시간 늦게 보이던 것 (0.9.4)
  // 페이지 이동(navigate)은 리다이렉트(Pages 가 .html → 깨끗한 주소로 308)를 따라간 응답을 그대로 주면 브라우저가 거부(ERR_FAILED)하므로 본문만 새 Response 로 옮긴다
  const fresh = () => {
    if (e.request.method !== "GET") return fetch(e.request);
    const p = fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" });
    return e.request.mode === "navigate" ? p.then((r) => new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers })) : p;
  };
  e.respondWith(
    fresh().then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
