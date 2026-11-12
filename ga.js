// 방문 통계 (Google Analytics 4) — 설정 앱의 홈(index.html)과 설정 페이지(settings-*.html)가 같이 쓴다. (0.9.10)
// 얼마나 쓰이는지만 본다: 본 화면(경로), 이 브라우저에 연결된 기기 수(0·1·2·3+), 앱 버전, 「제품 보기」 링크 클릭.
// 보내지 않는 것: 기기 ID·기기 이름·종목·Wi-Fi·연결 토큰. 주소에 붙은 기기 ID(?id=…, #/add?id=…)는 떼고 보낸다.
// 자동 수집(주소 변화에 따른 페이지 조회 등)은 주소 원문이 그대로 나가므로 애널리틱스 쪽에서 꺼 두었고, 페이지 조회는 여기서 직접 보낸다.
// 운영 주소에서만 켠다(개발 주소·로컬·기기 IP 에서는 아무것도 하지 않는다). 개인정보처리방침의 「앱」 항목과 같이 고친다.
(function () {
  var ID = "G-REG9Z4T9H8";   // 속성 「차트토템 설정 앱」(563954353), 애널리틱스 계정 「차트토템」(416047181). 소개 사이트 속성과 따로 둔다
  var HOST = "charttotem.lalatap.kr";
  // 주소에서 기기 ID 를 뗀다: 검색어(?…)는 통째로 버리고, 해시도 ? 앞까지만. 남는 건 「어느 화면인지」뿐이다
  function clean(u) {
    try {
      var a = new URL(u, location.href);
      var h = (a.hash || "").split("?")[0];
      return a.origin + a.pathname.replace(/\.html$/, "") + (h && h !== "#" && h !== "#/" ? h : "");
    } catch (e) { return ""; }
  }
  function devices() {
    try { var n = (JSON.parse(localStorage.getItem("ct.cloudDevices")) || []).length; return n >= 3 ? "3+" : String(n); } catch (e) { return ""; }
  }
  function title() {
    var p = location.pathname, r = (location.hash || "").slice(1).split("?")[0] || "/";
    return (/settings-/.test(p) ? "설정" : "홈") + " " + r;
  }
  var api = { clean: clean, devices: devices, title: title, id: ID, on: false };
  window.ctStats = api;   // 테스트·점검용
  if (location.hostname !== HOST || /X{6}/.test(ID)) return;
  api.on = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  var ref = document.referrer ? clean(document.referrer) : "";
  var ver = function () { try { return typeof APP_VERSION === "string" ? APP_VERSION : ""; } catch (e) { return ""; } };
  gtag("js", new Date());
  gtag("config", ID, { send_page_view: false, page_location: clean(location.href), page_referrer: ref, page_title: title() });
  function view() {
    var loc = clean(location.href), t = title();
    gtag("set", { page_location: loc, page_referrer: ref, page_title: t });
    gtag("event", "page_view", { page_location: loc, page_referrer: ref, page_title: t, devices: devices(), app_version: ver() });
  }
  window.addEventListener("hashchange", view);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", view); else view();
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a.shoplink") : null;
    if (a) gtag("event", "shop_link_click", { devices: devices(), app_version: ver() });
  });
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
  document.head.appendChild(s);
})();
