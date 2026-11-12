// 차트토템 소개 사이트 동작. 원본: tools/site/site.js → build.py 가 launcher/site/site.js 로 복사한다.
// 움직임은 framer-motion 의 브라우저용 번들(site/vendor/motion.js → window.Motion)로 건다.
// 이 파일이나 번들이 안 불려도 페이지는 전부 보이고, 구매 버튼·화면 고르기 말고는 잃는 게 없다(가격 전환은 head 의 한 줄 스크립트).
//  1) 모바일 아래 고정 구매 바: 히어로의 구매 버튼이 위로 지나가면 보이고, 마지막 구매 띠가 보이면 숨긴다
//  2) 화면 데모: 화면 15개 중 하나를 누르면 큰 기기 화면이 바뀐다. 본체 색도 바꾼다. 건드리기 전까지는 저절로 넘어간다
//  3) 움직임: 스크롤하면 떠오르기, 숫자 올라가기 (「움직임 줄이기」 설정이면 전부 끈다. 첫 화면 등장은 site.css 의 CSS 애니메이션)
(function () {
  var M = window.Motion;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canAnimate = !!M && !reduce;
  var IO = "IntersectionObserver" in window;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- 1) 고정 구매 바
  var bar = $("#buybar"), heroBuy = $("#heroBuy"), fin = $("#final");
  if (bar && heroBuy && fin && IO) {
    var past = false, atEnd = false;
    var update = function () {
      var on = past && !atEnd;
      bar.classList.toggle("on", on);
      bar.setAttribute("aria-hidden", on ? "false" : "true");
    };
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { past = !e.isIntersecting && e.boundingClientRect.top < 0; });
      update();
    }).observe(heroBuy);
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { atEnd = e.isIntersecting; });
      update();
    }, { threshold: 0.05 }).observe(fin);
  }

  // ---------- 2) 화면 데모
  var demo = $("#demo");
  if (demo) {
    var kind = demo.getAttribute("data-kind");
    var big = $(".cube-screen img", demo), bigSrc = $(".cube-screen source", demo);
    var cube = $(".cube", demo), nameEl = $("#demoName"), descEl = $("#demoDesc");
    var picks = $$(".screens button", demo), swatches = $$(".sw", demo);
    var current = 0, timer = null, touched = false;
    picks.forEach(function (b, i) { if (b.getAttribute("aria-pressed") === "true") current = i; });

    var show = function (i, byUser) {
      var b = picks[i];
      if (!b) return;
      current = i;
      picks.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      var base = "/site/img/screen-" + kind + "-" + b.getAttribute("data-screen");
      if (bigSrc) bigSrc.setAttribute("srcset", base + ".webp");
      big.setAttribute("src", base + ".png");
      big.setAttribute("alt", "지금 고른 화면: " + b.getAttribute("data-name"));
      nameEl.textContent = b.getAttribute("data-name");
      descEl.textContent = b.getAttribute("data-desc");
      if (canAnimate) {
        M.animate(big, { opacity: [0.25, 1], scale: [0.94, 1] }, { duration: 0.28, ease: "easeOut" });
        if (byUser) M.animate(cube, { rotate: [0, -2.5, 2, 0] }, { duration: 0.4, ease: "easeOut" });
      }
    };
    var stop = function () { touched = true; if (timer) { clearInterval(timer); timer = null; } };
    picks.forEach(function (b, i) {
      b.addEventListener("click", function () { stop(); show(i, true); });
    });
    swatches.forEach(function (sw) {
      sw.addEventListener("click", function () {
        stop();
        demo.setAttribute("data-color", sw.getAttribute("data-color"));
        swatches.forEach(function (x) { x.setAttribute("aria-pressed", x === sw ? "true" : "false"); });
        if (canAnimate) M.animate(cube, { scale: [0.93, 1.03, 1] }, { duration: 0.35, ease: "easeOut" });
      });
    });
    // 건드리기 전까지, 화면에 보이는 동안만 저절로 넘긴다
    if (IO && !reduce) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (touched) return;
          if (e.isIntersecting && !timer) timer = setInterval(function () { show((current + 1) % picks.length, false); }, 2200);
          else if (!e.isIntersecting && timer) { clearInterval(timer); timer = null; }
        });
      }, { threshold: 0.3 }).observe(cube);
    }
  }

  // ---------- 3) 움직임
  if (!canAnimate) return;
  // (첫 화면 등장은 CSS 애니메이션이 한다: 스크립트를 기다리면 보였다가 사라졌다 다시 뜨는 깜빡임이 생긴다)
  // 스크롤하면 떠오르기: 처음에 화면 밖에 있던 것만 숨겼다가 들어올 때 올린다
  var vh = window.innerHeight;
  $$(".sec h2, .sec .txt, .sec figure, .facts > div, .cmp tr, .reviews li, .steps li, .demo-dev, .faq details, .checks li, .final h2, .final .buybox").forEach(function (el) {
    if (el.getBoundingClientRect().top < vh * 0.92) return;
    el.classList.add("rv-wait");
    M.inView(el, function () {
      el.classList.remove("rv-wait");
      M.animate(el, { opacity: [0, 1], y: [22, 0] }, { duration: 0.5, ease: "easeOut" });
    }, { amount: 0.15 });
  });

  // 숫자 올라가기
  $$("[data-count]").forEach(function (el) {
    var to = +el.getAttribute("data-count");
    M.inView(el, function () {
      M.animate(0, to, { duration: 0.9, ease: "easeOut", onUpdate: function (v) { el.textContent = Math.round(v); } });
    }, { amount: 0.6 });
  });
})();
