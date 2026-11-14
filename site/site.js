// 차트토템 소개 사이트 동작. 원본: tools/site/site.js → build.py 가 launcher/site/site.js 로 복사한다.
// 움직임은 framer-motion 의 브라우저용 번들(site/vendor/motion.js → window.Motion)로 건다.
// 이 파일이나 번들이 안 불려도 페이지는 전부 보이고, 구매 버튼·화면 고르기 말고는 잃는 게 없다(가격 전환은 head 의 한 줄 스크립트).
//  0) 방문 통계(GA4 태그가 있을 때만): buy_click · section_view · demo_pick · demo_color
//  1) 모바일 아래 고정 구매 바: 히어로의 구매 버튼이 위로 지나가면 보이고, 마지막 구매 띠가 보이면 숨긴다
//  2) 화면 데모: 화면 15개 중 하나를 누르면 큰 기기 화면이 바뀐다. 본체 색도 바꾼다. 건드리기 전까지는 저절로 넘어간다
//  3) 후기 사진 크게 보기: 사진을 누르면 화면 가득 뜬다. 뒤로 가기(안드로이드 뒤로 버튼 포함)는 페이지를 떠나지 않고 사진만 닫는다
//  4) 움직임: 스크롤하면 떠오르기, 숫자 올라가기 (「움직임 줄이기」 설정이면 전부 끈다. 첫 화면 등장은 site.css 의 CSS 애니메이션)
(function () {
  var M = window.Motion;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canAnimate = !!M && !reduce;
  var IO = "IntersectionObserver" in window;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- 0) 방문 통계(GA4): 태그가 있을 때만. 어느 버튼을 눌렀는지, 어디까지 읽었는지, 데모를 만졌는지
  var product = (document.body.className.match(/p-(stock|coin)/) || [])[1] || "";
  var track = function (name, params) {
    if (typeof window.gtag !== "function") return;
    params = params || {};
    params.product = product;
    window.gtag("event", name, params);
  };
  $$("a[data-buy]").forEach(function (a) {
    a.addEventListener("click", function () { track("buy_click", { button: a.getAttribute("data-buy") }); });
  });
  if (IO) {
    var seen = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        seen.unobserve(e.target);
        track("section_view", { section: e.target.id });
      });
    }, { threshold: 0.25 });
    $$("main section[id]").forEach(function (s) { seen.observe(s); });
  }

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
    var nowEl = $("#demoNow");
    // 사용자가 직접 고른 뒤에만 화면 이름을 읽어 준다(저절로 넘어갈 때마다 스크린리더가 읽으면 시끄럽다)
    var stop = function () { touched = true; if (timer) { clearInterval(timer); timer = null; } if (nowEl) nowEl.setAttribute("aria-live", "polite"); };
    picks.forEach(function (b, i) {
      b.addEventListener("click", function () { stop(); show(i, true); track("demo_pick", { screen: b.getAttribute("data-screen") }); });
    });
    swatches.forEach(function (sw) {
      sw.addEventListener("click", function () {
        stop();
        track("demo_color", { color: sw.getAttribute("data-color") });
        demo.setAttribute("data-color", sw.getAttribute("data-color"));
        swatches.forEach(function (x) { x.setAttribute("aria-pressed", x === sw ? "true" : "false"); });
        if (canAnimate) M.animate(cube, { scale: [0.93, 1.03, 1] }, { duration: 0.35, ease: "easeOut" });
      });
    });
    // 건드리기 전까지, 화면에 보이는 동안만 저절로 넘긴다
    if (IO && !reduce) {
      var visible = false, held = false;   // held: 마우스·키보드가 데모 위에 있는 동안은 멈춘다
      var sync = function () {
        var run = visible && !held && !touched;
        if (run && !timer) timer = setInterval(function () { show((current + 1) % picks.length, false); }, 2200);
        else if (!run && timer) { clearInterval(timer); timer = null; }
      };
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { visible = e.isIntersecting; });
        sync();
      }, { threshold: 0.3 }).observe(cube);
      ["pointerenter", "focusin"].forEach(function (ev) { demo.addEventListener(ev, function () { held = true; sync(); }); });
      ["pointerleave", "focusout"].forEach(function (ev) { demo.addEventListener(ev, function () { held = false; sync(); }); });
    }
  }

  // ---------- 3) 후기 사진 크게 보기
  // 열 때 방문 기록에 한 칸을 더 쌓는다(pushState). 그래서 뒤로 가기가 페이지를 떠나지 않고 그 한 칸만 되돌린다.
  // 뜬 사진은 언제나 history.state 를 따라간다: 사진 번호가 있으면 띄우고 없으면 닫는다(뒤로·앞으로·새로 고침 모두 같은 규칙).
  // 닫기 버튼·바깥 누르기·Esc 는 직접 닫지 않고 history.back() 을 부른다 → 쌓은 칸이 남아 「뒤로 가기를 두 번 눌러야 나가지는」 일이 없다.
  // <dialog> 가 없는 옛 브라우저에서는 아무것도 걸지 않는다: 링크라서 큰 사진 파일이 그대로 열린다.
  var zooms = $$("a[data-zoom]");
  if (zooms.length && typeof HTMLDialogElement === "function" && HTMLDialogElement.prototype.showModal) {
    var ZKEY = "rvPhoto";
    var root = document.documentElement;
    var dlg = null, zPic, zBar, zCount, zAt = -1, zGoing = false;
    var zState = function () { var s = window.history.state; return s && typeof s[ZKEY] === "number" ? s[ZKEY] : -1; };
    var zSet = function (how, i) {   // how: pushState | replaceState. 막힌 환경(일부 앱 안 브라우저의 샌드박스)이면 false
      var st = {}; st[ZKEY] = i;
      try { window.history[how](st, ""); return true; } catch (e) { return false; }
    };
    // 넘기는 범위: 같은 후기에 붙은 사진끼리
    var zGroup = function (i) {
      var li = zooms[i].closest("li");
      return zooms.filter(function (a) { return a.closest("li") === li; });
    };
    var zPaint = function (i) {
      var a = zooms[i], thumb = $("img", a), g = zGroup(i);
      zAt = i;
      // 큰 사진이 오는 동안 이미 받아 둔 작은 사진을 바탕에 깔아 둔다
      zPic.style.backgroundImage = thumb && (thumb.currentSrc || thumb.src) ? 'url("' + (thumb.currentSrc || thumb.src) + '")' : "";
      zPic.setAttribute("src", a.getAttribute("href").replace(/\.jpg$/, ".webp"));   // <dialog> 를 아는 브라우저는 webp 도 안다. 링크(href)는 어디서나 열리게 jpg
      zPic.setAttribute("alt", thumb ? thumb.getAttribute("alt") : "");
      zBar.hidden = g.length < 2;
      zCount.textContent = (g.indexOf(a) + 1) + " / " + g.length;
    };
    // 쌓아 둔 칸 되돌리기. back() 은 조금 뒤에 끝나므로 그 사이에 또 부르지 않게 막는다(닫기를 두 번 누르면 두 칸을 되돌아가 페이지를 떠난다)
    var zBack = function () {
      if (zState() < 0) return false;
      if (!zGoing) { zGoing = true; window.history.back(); }   // popstate → zSync 가 닫는다
      return true;
    };
    var zLeave = function () { if (!zBack() && dlg && dlg.open) dlg.close(); };
    var zMove = function (d) {
      var g = zGroup(zAt);
      if (g.length < 2) return;
      var i = zooms.indexOf(g[(g.indexOf(zooms[zAt]) + d + g.length) % g.length]);
      if (zState() >= 0) zSet("replaceState", i);   // 넘길 때는 칸을 더 쌓지 않는다: 뒤로 가기 한 번이면 닫힌다
      zPaint(i);
    };
    var zBuild = function () {
      var icon = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; };
      dlg = document.createElement("dialog");
      dlg.className = "zoom";
      dlg.setAttribute("aria-label", "후기 사진 크게 보기");
      dlg.tabIndex = -1;   // 열릴 때 초점은 창 자체에(닫기 버튼에 주면 손으로 눌러 연 사람에게도 초점 테두리가 뜬다). Tab 을 누르면 버튼으로 간다
      dlg.innerHTML =
        '<button type="button" class="zoom-x" aria-label="닫기">' + icon("M6 6l12 12M18 6L6 18") + "</button>" +
        '<img class="zoom-pic" alt="" width="1080" height="1080" decoding="async">' +
        '<div class="zoom-bar"><button type="button" class="zoom-prev" aria-label="이전 사진">' + icon("M15 5l-7 7 7 7") + "</button>" +
        '<span class="zoom-n num" aria-live="polite"></span>' +
        '<button type="button" class="zoom-next" aria-label="다음 사진">' + icon("M9 5l7 7-7 7") + "</button></div>";
      document.body.appendChild(dlg);
      zPic = $(".zoom-pic", dlg); zBar = $(".zoom-bar", dlg); zCount = $(".zoom-n", dlg);
      $(".zoom-x", dlg).addEventListener("click", zLeave);
      $(".zoom-prev", dlg).addEventListener("click", function () { zMove(-1); });
      $(".zoom-next", dlg).addEventListener("click", function () { zMove(1); });
      dlg.addEventListener("click", function (ev) { if (ev.target === dlg) zLeave(); });   // 사진·버튼 바깥의 어두운 곳
      dlg.addEventListener("keydown", function (ev) {
        if (ev.key === "ArrowLeft") zMove(-1);
        else if (ev.key === "ArrowRight") zMove(1);
      });
      // Esc, 그리고 뒤로 버튼을 <dialog> 닫기로 먼저 받아 가는 브라우저(안드로이드 크롬)는 방문 기록을 건드리지 않고 창만 닫는다 → 쌓아 둔 칸을 여기서 되돌린다
      dlg.addEventListener("close", function () {
        root.classList.remove("zoom-open");
        root.style.paddingRight = "";
        zBack();
      });
      // 옆으로 밀어 넘기기(손가락 하나, 확대해서 보는 중이 아닐 때만)
      var sx = 0, sy = 0, one = false;
      dlg.addEventListener("touchstart", function (ev) {
        one = ev.touches.length === 1;
        if (one) { sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }
      }, { passive: true });
      dlg.addEventListener("touchend", function (ev) {
        if (!one || !ev.changedTouches.length) return;
        one = false;
        if (window.visualViewport && window.visualViewport.scale > 1.01) return;
        var dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) zMove(dx < 0 ? 1 : -1);
      }, { passive: true });
    };
    var zOpen = function (i) {
      if (!dlg) zBuild();
      zPaint(i);
      if (dlg.open) return;
      dlg.showModal(); dlg.focus();
      // 뒤 페이지 스크롤을 잠그면 스크롤바가 사라져 폭이 넓어진다 → 글이 다시 줄바꿈되면서 닫은 뒤 읽던 자리가 밀린다. 그 폭만큼 메워 둔다(스크롤바가 화면 위에 뜨는 폰에서는 0)
      var sb = window.innerWidth - root.clientWidth;
      root.classList.add("zoom-open");
      if (sb > 0) root.style.paddingRight = sb + "px";
    };
    var zSync = function () {
      zGoing = false;
      var i = zState();
      if (i >= 0 && zooms[i]) zOpen(i);
      else if (dlg && dlg.open) dlg.close();
    };
    zooms.forEach(function (a, i) {
      a.addEventListener("click", function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button) return;   // 새 탭·새 창으로 열기는 그대로 둔다
        ev.preventDefault();
        zSet("pushState", i);
        zOpen(i);
        track("review_photo", { photo: a.getAttribute("data-zoom") });
      });
    });
    window.addEventListener("popstate", zSync);
    zSync();   // 사진을 띄운 채 새로 고친 경우: 방문 기록에 그 칸이 남아 있으므로 다시 띄워 맞춘다
  }

  // ---------- 4) 움직임
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
