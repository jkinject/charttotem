// 차트토템 소개 사이트 동작. 원본: tools/site/site.js → build.py 가 launcher/site/site.js 로 복사한다.
// 하는 일은 하나: 모바일에서 히어로의 구매 버튼이 화면 위로 지나가면 아래 고정 구매 바를 보이고, 마지막 구매 띠가 보이면 숨긴다.
// (가격 전환은 head 의 한 줄 스크립트가 한다. 이 파일이 안 불려도 페이지는 그대로 쓸 수 있다.)
(function () {
  var bar = document.getElementById("buybar");
  var hero = document.getElementById("heroBuy");
  var fin = document.getElementById("final");
  if (!bar || !hero || !fin || !("IntersectionObserver" in window)) return;
  var past = false, atEnd = false;
  function update() {
    var on = past && !atEnd;
    bar.classList.toggle("on", on);
    bar.setAttribute("aria-hidden", on ? "false" : "true");
  }
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { past = !e.isIntersecting && e.boundingClientRect.top < 0; });
    update();
  }).observe(hero);
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { atEnd = e.isIntersecting; });
    update();
  }, { threshold: 0.05 }).observe(fin);
})();
