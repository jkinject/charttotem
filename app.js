// 차트토템 런처 (GitHub Pages, HTTPS)
// - 기기 목록은 localStorage. 온보딩 성공 페이지/기기 QR 이 ?add=1&id=&ip=&host=&ssid= 로 넘겨주면 자동 등록.
// - 기기 통신은 HTTP(사설 IP) 라서 HTTPS 페이지에서는 원래 막히지만, Chrome 141+ 의 Local Network Access
//   (fetch 에 targetAddressSpace 옵션) 로 허용된다 (권한 창 1회). 안 되는 브라우저는 "열기만" 모드.
const APP_VERSION = "0.4.0";
const KEY_DEVICES = "ct.devices";
const KEY_INSTALL = "ct.installDone";
const KEY_LNA = "ct.lnaOption";
// 코인 카드의 추천 칩. 주식은 칩 없이 검색으로만 추가한다 (kstock 목록은 종목명 표시용 힌트로만 쓴다)
const POPULAR = {
  coin: ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "SUI", "PEPE"],
  kstock: [["005930", "삼성전자"], ["000660", "SK하이닉스"], ["373220", "LG엔솔"], ["005380", "현대차"], ["035420", "NAVER"], ["035720", "카카오"],
    ["TSLA.O", "테슬라"], ["AAPL.O", "애플"], ["NVDA.O", "엔비디아"], ["MSFT.O", "마이크로소프트"]],
};
const STOCK_NAMES = {};   // 검색에서 고른 종목의 이름 (코드 → 이름). 기기가 확인해 주기 전 화면에 먼저 보여 준다
// 시간대 프리셋 (POSIX TZ 문자열, 펌웨어 2.0.0+ 의 /api/settings?tz=). 목록에 없으면 "직접 입력".
const TZ_PRESETS = [["KST-9", "서울 (KST)"], ["JST-9", "도쿄 (JST)"], ["HKT-8", "홍콩 (HKT)"], ["CST-8", "상하이 · 싱가포르"], ["IST-5:30", "뭄바이 (IST)"],
  ["GMT0BST,M3.5.0/1,M10.5.0", "런던 (GMT/BST)"], ["CET-1CEST,M3.5.0,M10.5.0/3", "파리 · 베를린 (CET)"], ["EST5EDT,M3.2.0,M11.1.0", "뉴욕 (EST/EDT)"],
  ["CST6CDT,M3.2.0,M11.1.0", "시카고 (CST/CDT)"], ["PST8PDT,M3.2.0,M11.1.0", "로스앤젤레스 (PST/PDT)"], ["AEST-10AEDT,M10.1.0,M4.1.0/3", "시드니 (AEST/AEDT)"]];
const LAYOUTS_CACHE = {};   // 기기 키 → /api/layouts 의 목록 (펌웨어 버전별로 다시 받는다)

const $ = (id) => document.getElementById(id);
const I = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;   // Lucide 라인 아이콘 (index.html 의 스프라이트)
let devices = loadDevices();
let lnaOption = null;      // fetch 에 넣을 옵션 (알아낸 뒤 저장)
let openOnly = false;      // 기기 상태를 볼 수 없는 브라우저
let refreshTimer = null;

// ------------------------------------------------------------
// 저장
// ------------------------------------------------------------
function loadDevices() { try { return JSON.parse(localStorage.getItem(KEY_DEVICES)) || []; } catch (e) { return []; } }
function saveDevices() { try { localStorage.setItem(KEY_DEVICES, JSON.stringify(devices)); } catch (e) {} }
function upsertDevice(d) {
  if (!d.ip && !d.id) return null;
  let cur = d.id ? devices.find((x) => x.id === d.id) : devices.find((x) => x.ip === d.ip);
  if (!cur) { cur = { id: d.id || "", name: "", addedAt: Date.now() }; devices.unshift(cur); }
  for (const k of ["id", "ip", "host", "ssid", "name", "variant"]) if (d[k]) cur[k] = d[k];
  saveDevices();
  return cur;
}

// ------------------------------------------------------------
// 기기 통신 (LNA)
// ------------------------------------------------------------
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua);
const chromeVer = +((ua.match(/Chrome\/(\d+)/) || [])[1] || 0);
const lnaLikely = !isIOS && chromeVer >= 141 && !/SamsungBrowser/.test(ua);

try { lnaOption = JSON.parse(localStorage.getItem(KEY_LNA)); } catch (e) {}

// 브라우저가 로컬 요청 자체를 막는지(혼합 콘텐츠) 알아낸다: 막히면 타임아웃 없이 즉시 실패한다.
let blockedHits = 0;
function markUnblocked() {
  openOnly = false; blockedHits = 0;
  $("browserCard").classList.add("hidden");
  clearInterval(refreshTimer); refreshTimer = setInterval(refreshAll, 10000);
}
function markBlocked() {
  if (++blockedHits < 2 || openOnly) return;
  openOnly = true;
  clearInterval(refreshTimer);
  $("browserCard").classList.remove("hidden");
  $("browserCard").querySelector(".msg").innerHTML = "이 브라우저는 기기와 직접 통신을 막아요. <b>기기 설정 열기</b>는 되지만 가격·연결 상태는 안 보여요. 안드로이드는 <b>Chrome 141 이상</b>에서 열면 돼요 (처음 한 번 '로컬 네트워크 접근' 허용).";
  renderDevices();
}

async function deviceFetch(ip, path, { method = "GET", timeout = 2500, detectBlock = false } = {}) {
  const url = `http://${ip}${path}`;
  const candidates = lnaOption ? [lnaOption] : [{ targetAddressSpace: "local" }, { targetAddressSpace: "private" }, {}];
  const started = Date.now();
  for (const opt of candidates) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const r = await fetch(url, { method, cache: "no-store", signal: ac.signal, ...opt });
      clearTimeout(t);
      if (!lnaOption) { lnaOption = opt; try { localStorage.setItem(KEY_LNA, JSON.stringify(opt)); } catch (e) {} }
      if (openOnly) markUnblocked();   // 한 번이라도 통신이 됐으면 "막힘" 이 아니다
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      if (e.name === "AbortError") return null;   // 타임아웃: 옵션 문제가 아니라 기기가 안 닿는 것
    }
  }
  if (detectBlock && !lnaOption && Date.now() - started < 400) markBlocked();  // 등록 기기도 즉시 실패 = 브라우저가 막음
  return null;
}

async function probe(ip, timeout, detectBlock) { return deviceFetch(ip, "/api/state", { timeout, detectBlock }); }

// ------------------------------------------------------------
// 화면
// ------------------------------------------------------------
function fmtName(d) { return d.name || (d.id ? `차트토템 ${d.id.slice(-4)}` : d.ip); }
function isStock(d) { return d.variant === "kstock"; }

// 가격 표기 (주식): KRW 는 정수 + 원, USD 는 $ + 소수 2자리(10,000 이상이면 정수), 그 외는 숫자 + 통화 코드
function money(p, cur) {
  if (!(p > 0)) return "–";
  cur = cur || "KRW";
  if (cur === "KRW") return p.toLocaleString() + " 원";
  const o = { minimumFractionDigits: p >= 10000 ? 0 : 2, maximumFractionDigits: p >= 10000 ? 0 : 2 };
  return cur === "USD" ? "$" + p.toLocaleString(undefined, o) : p.toLocaleString(undefined, o) + " " + cur;
}

function renderDevices() {
  const box = $("devices");
  box.innerHTML = "";
  $("emptyCard").classList.toggle("hidden", devices.length > 0);
  for (const d of devices) {
    const el = document.createElement("div");
    const stock = isStock(d);
    el.className = "dev" + (stock ? " kr" : "");   // 주식 기기는 상승 빨강 / 하락 파랑
    el.dataset.key = d.id || d.ip;
    el.dataset.variant = d.variant || "";
    const sub = [d.ssid ? "Wi-Fi " + d.ssid : "", d.ip, d.host].filter(Boolean).join(" · ");
    const input = stock ? `
      <div class="search">
        ${I("search")}
        <input type="text" data-r="input" placeholder="종목명 · 티커 · 종목코드" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" enterkeyhint="go">
        <button class="clear hidden" data-r="clear" aria-label="지우기">${I("x")}</button>
      </div>
      <div class="results hidden" data-r="results"><div class="rcount" data-r="rcount"></div><ul class="rlist" data-r="rlist"></ul></div>`
      : `<div class="search">${I("coins")}<input type="text" data-r="input" placeholder="심볼 (예: ARB)" maxlength="12" autocapitalize="characters" autocomplete="off"><button class="clear" data-r="apply" aria-label="추가">${I("plus")}</button></div>`;
    el.innerHTML = `
      <div class="profile"><span class="dot" data-r="dot"></span><div class="ptext"><div class="pname" data-r="name">${esc(fmtName(d))}</div><div class="psub" data-r="sub">${esc(sub)}</div></div><button class="more" data-r="more" title="이름 바꾸기 · 삭제" aria-label="더보기">${I("more")}</button></div>
      <div class="hero"><span class="sym" data-r="sym">${d.symbol ? esc(d.symbol) : ""}</span><span class="price" data-r="price">${d.priceText ? esc(d.priceText) : "–"}</span><span class="chg" data-r="chg"></span></div>
      <ul class="slist hidden" data-r="list"></ul>
      <div class="setrow hidden" data-r="rotRow">${I("repeat")}<span class="mtext"><span class="mlbl">화면 전환</span><span class="msub" data-r="rotHint"></span></span><select class="val" data-r="rotate" aria-label="화면 전환"><option value="0">끄기</option><option value="3">3초</option><option value="5">5초</option><option value="10">10초</option><option value="15">15초</option><option value="30">30초</option><option value="60">60초</option></select></div>
      <div class="chips" data-r="chips"></div>
      ${input}
      <div class="msg" data-r="msg"></div>
      <div class="screen hidden" data-r="screen">
        <div class="seg wide" data-r="tabs" role="radiogroup"><button class="tab" data-t="stock">주식</button><button class="tab" data-t="clock">시계</button></div>
        <ul class="llist" data-r="llist"></ul>
        <div class="setrow">${I("palette")}<span class="mtext"><span class="mlbl">상승 · 하락 색</span></span><select class="val" data-r="colors"><option value="kr">한국식</option><option value="global">글로벌</option></select></div>
        <div class="setrow">${I("globe")}<span class="mtext"><span class="mlbl">시간대</span></span><select class="val" data-r="tz"></select></div>
        <div class="formrow hidden" data-r="tzRow"><input type="text" class="text" data-r="tzInput" placeholder="POSIX TZ (예: KST-9)" maxlength="47"><button class="textbtn" data-r="tzSave">${I("check")}저장</button></div>
        <div class="msg" data-r="scrMsg"></div>
      </div>
      <nav class="list">
        <button class="menu hidden" data-r="scrBtn">${I("monitor")}<span class="mtext"><span class="mlbl">화면 · 레이아웃</span><span class="msub" data-r="scrSub">레이아웃 · 색 · 시간대</span></span></button>
        <a class="menu" href="http://${esc(d.ip)}/" target="_blank" rel="noopener">${I("settings")}<span class="mtext"><span class="mlbl">기기 설정 열기</span><span class="msub">${esc(d.host ? d.host + " · " : "")}${esc(d.ip)}</span></span></a>
      </nav>
      <div class="band"></div>`;
    el.querySelector('[data-r="more"]').onclick = () => deviceMenu(d);
    el.querySelector('[data-r="rotate"]').onchange = (e) => setRotate(d, e.target.value);
    attachScreen(d, el);
    if (stock) attachSearch(d, el);
    else {
      el.querySelector('[data-r="apply"]').onclick = () => applySymbol(d, el.querySelector('[data-r="input"]').value);
      el.querySelector('[data-r="input"]').onkeydown = (e) => { if (e.key === "Enter") applySymbol(d, e.target.value); };
    }
    renderChips(d, el);
    box.appendChild(el);
  }
}

// 종목 검색 (주식 카드): 300ms 디바운스 → 기기의 /api/search (네이버 자동완성 프록시, 국내+해외).
// 국내 행은 가격이 같이 오고, 해외 행은 /api/quote 로 한 행씩 순서대로 채운다 (기기 웹 서버가 단일 스레드).
// 행을 누르면 applySymbol 로 기존 변경 흐름. Enter 는 첫 행 선택 (결과가 없으면 입력값을 코드/티커로 적용).
function attachSearch(d, el) {
  const q = (r) => el.querySelector(`[data-r="${r}"]`);
  const inp = q("input"), box = q("results"), list = q("rlist"), cnt = q("rcount"), clr = q("clear");
  let timer = null, seq = 0, hits = [], pickFirst = false;
  const hl = (name, s) => { const i = name.toLowerCase().indexOf(s.toLowerCase()); if (i < 0 || !s) return esc(name);
    return esc(name.slice(0, i)) + "<b>" + esc(name.slice(i, i + s.length)) + "</b>" + esc(name.slice(i + s.length)); };
  const badge = (ex) => { const k = ex === "KOSPI" ? "ks" : ex === "KOSDAQ" ? "kq" : "fx"; const t = ex === "KOSPI" ? "코스피" : ex === "KOSDAQ" ? "코스닥" : ex || ""; return `<span class="badge ${k}">${esc(t)}</span>`; };
  const fill = (li, h) => {
    const p = li.querySelector(".p"), c = li.querySelector(".c");
    if (h.price > 0) {
      p.textContent = money(h.price, h.currency || (h.nation === "KOR" ? "KRW" : "USD"));
      c.textContent = (h.change >= 0 ? "+" : "") + Number(h.change).toFixed(2) + "%"; c.className = "c " + (h.change >= 0 ? "up" : "down");
    } else { p.textContent = h.priced === false ? "" : "–"; c.textContent = ""; }
  };
  const row = (h, s) => {
    const li = document.createElement("li"); li.className = "rrow";
    li.innerHTML = `<div class="l"><div class="nm">${hl(h.name, s)}</div><div class="cd">${esc(h.symbol || h.code)} ${badge(h.exchange)}</div></div><div class="px"><div class="p"></div><div class="c"></div></div>`;
    li.onclick = () => pick(h); fill(li, h); return li;
  };
  const busy = () => timer !== null || cnt.textContent === "검색 중...";
  const hide = () => { clearTimeout(timer); timer = null; pickFirst = false; box.classList.add("hidden"); list.innerHTML = ""; cnt.textContent = ""; hits = []; seq++; clr.classList.add("hidden"); };
  const pick = (h) => { STOCK_NAMES[h.code] = h.name; hide(); inp.value = ""; inp.blur(); applySymbol(d, h.code); };
  async function fillPrices(my, rows) {
    for (const [h, li] of rows) {
      if (my !== seq) return;
      const r = await deviceFetch(d.ip, "/api/quote?code=" + encodeURIComponent(h.code), { timeout: 8000 });
      if (my !== seq) return;
      if (r && r.ok) { Object.assign(h, { price: r.price, diff: r.diff, change: r.change, currency: r.currency, priced: true }); fill(li, h); }
    }
  }
  async function run(s) {
    const my = ++seq; hits = []; box.classList.remove("hidden"); list.innerHTML = "";
    if (openOnly) { cnt.textContent = "이 브라우저에서는 검색이 안 돼요. 「기기 설정 열기」에서 찾아 주세요."; pickFirst = false; return; }
    cnt.textContent = "검색 중...";
    let r = await deviceFetch(d.ip, "/api/search?q=" + encodeURIComponent(s), { timeout: 10000 });
    if (!r && my === seq) r = await deviceFetch(d.ip, "/api/search?q=" + encodeURIComponent(s), { timeout: 10000 });   // 기기 응답이 가끔 끊긴다 → 한 번 더
    if (my !== seq) return;
    if (!r) { cnt.textContent = "검색하지 못했어요. 기기에 닿는지 확인하고 다시 시도해 주세요."; pickFirst = false; return; }
    hits = r.items || [];
    cnt.textContent = hits.length ? hits.length + " 종목" : "검색 결과가 없어요";
    const pend = [];
    hits.forEach((h) => { const li = row(h, s); list.appendChild(li); if (!h.priced) pend.push([h, li]); });
    if (pickFirst) { pickFirst = false; if (hits.length) { pick(hits[0]); return; } }
    if (pend.length) fillPrices(my, pend);
  }
  inp.oninput = () => {
    const s = inp.value.trim(); clr.classList.toggle("hidden", !inp.value);
    clearTimeout(timer); hits = []; seq++;   // 이전 응답은 버리고, Enter 가 옛 결과를 고르지 않게
    if (!s) { hide(); return; }
    timer = setTimeout(() => { timer = null; run(s); }, 300);
  };
  inp.onkeydown = (e) => {
    if (e.key !== "Enter") return;
    if (hits.length) pick(hits[0]);
    else if (busy()) { pickFirst = true; if (timer !== null) { clearTimeout(timer); timer = null; const s = inp.value.trim(); if (s) run(s); } }
    else applySymbol(d, inp.value);
  };
  clr.onclick = () => { inp.value = ""; inp.oninput(); inp.focus(); };
  el._hideSearch = hide;
}

function renderChips(d, el) {
  const chips = el.querySelector('[data-r="chips"]');
  chips.innerHTML = "";
  if (isStock(d)) { chips.classList.add("hidden"); return; }   // 주식은 기본 종목 칩 없이 검색으로만 추가한다
  chips.classList.remove("hidden");
  const list = POPULAR.coin;
  for (const item of list) {
    const [v, label] = Array.isArray(item) ? item : [item, item];
    const c = document.createElement("button");
    c.className = "chip" + ((d.codes ? d.codes.includes(v) : d.symbolKeyValue === v) ? " on" : "");
    c.textContent = label;
    c.onclick = () => applySymbol(d, v);
    chips.appendChild(c);
  }
}

// 등록 종목 목록 (펌웨어 1.5.0+: /api/state 의 codes/slots). 기기 화면은 rotate 초마다 다음 종목으로 넘어간다.
const LIVE = {};   // 기기 키 → 마지막 /api/state (slots 는 localStorage 에 저장하지 않는다)
function slotMoney(d, sl) {
  if (!(sl.price > 0)) return "–";
  if (isStock(d)) return money(sl.price, sl.currency);
  const p = sl.price;
  return p >= 1000 ? "$" + Math.round(p).toLocaleString() : p >= 1 ? "$" + p.toFixed(2) : p >= 0.01 ? "$" + p.toFixed(4) : "$" + p.toFixed(8);
}
function renderList(d, el, s) {
  const ul = el.querySelector('[data-r="list"]'), rotRow = el.querySelector('[data-r="rotRow"]');
  if (!s || !s.codes) { ul.classList.add("hidden"); rotRow.classList.add("hidden"); return; }   // 옛 펌웨어: 종목 하나
  ul.classList.remove("hidden"); rotRow.classList.remove("hidden");
  ul.innerHTML = "";
  const slots = s.slots || [], pend = el._pending;
  slots.forEach((sl, i) => {
    const li = document.createElement("li"); li.className = "srow";
    const label = isStock(d) ? (sl.stockName || STOCK_NAMES[sl.code] || (POPULAR.kstock.find(([c]) => c === sl.code) || [])[1] || sl.code) : sl.code + "USDT";
    const ex = sl.exchange || "", badge = isStock(d) && ex ? ` <span class="badge ${ex === "KOSPI" ? "ks" : ex === "KOSDAQ" ? "kq" : "fx"}">${esc(ex === "KOSPI" ? "코스피" : ex === "KOSDAQ" ? "코스닥" : ex)}</span>` : "";
    const sub = esc(isStock(d) ? (sl.symbolCode || sl.code) : sl.code) + badge +
      (sl.validating ? ' <span class="badge">확인 중</span>' : sl.ok ? "" : sl.error ? ` <span class="badge fx">${esc(sl.error)}</span>` : ' <span class="badge">대기</span>');
    const up = sl.change >= 0;
    li.innerHTML = `<span></span><div class="l"><div class="nm">${esc(label)}</div><div class="cd">${sub}</div></div>` +
      `<div class="px"><div class="p">${sl.ok ? esc(slotMoney(d, sl)) : "–"}</div><div class="c ${up ? "up" : "down"}">${sl.ok ? (up ? "+" : "") + Number(sl.change).toFixed(2) + "%" : ""}</div></div>` +
      `<button class="rm" title="삭제" aria-label="삭제">${I("x")}</button>`;
    li.querySelector(".rm").onclick = () => removeSymbol(d, sl.code);
    ul.appendChild(li);
  });
  if (pend && !s.codes.includes(pend)) {
    const li = document.createElement("li"); li.className = "srow";
    li.className = "srow pend";
    li.innerHTML = `<span></span><div class="l"><div class="nm">${esc(pendingLabel(d, pend))}</div><div class="cd">${esc(pend)} <span class="badge">확인 중</span></div></div><div class="px"><div class="p">–</div></div><span></span>`;
    ul.appendChild(li);
  }
  const sel = el.querySelector('[data-r="rotate"]');
  if (document.activeElement !== sel) sel.value = String(s.rotate == null ? 5 : s.rotate);
  el.querySelector('[data-r="rotHint"]').textContent = s.codes.length > 1 ? (s.rotate > 0 ? s.rotate + "초마다 다음 종목으로" : "전환 꺼짐") : "종목을 더 추가하면 차례로 넘어가요";
}
async function setRotate(d, v) {
  const r = await deviceFetch(d.ip, `/api/settings?rotate=${encodeURIComponent(v)}`, { method: "POST", timeout: 4000 });
  if (r && r.ok === false) toast("전환 간격을 바꾸지 못했어요");
  refreshDevice(d);
}
async function removeSymbol(d, code) {
  const el = cardOf(d); const msg = el.querySelector('[data-r="msg"]');
  const r = await deviceFetch(d.ip, `/api/settings?remove=${encodeURIComponent(code)}`, { method: "POST", timeout: 4000 });
  if (r && r.ok === false) { msg.className = "msg err"; msg.textContent = r.error === "last" ? "종목은 최소 1개는 있어야 해요." : "빼지 못했어요. (" + r.error + ")"; return; }
  msg.className = "msg"; msg.textContent = code + " 뺐어요.";
  await sleep(300); refreshDevice(d);
}

// ---- 화면 · 레이아웃 (펌웨어 2.0.0+: /api/state 에 layout 이 있을 때만) ----
// 테마 탭(주식/시계) → 레이아웃 목록(기기의 /api/layouts) → 누르면 POST /api/settings?layout=<ID>. 색 관례(colors)와 시간대(tz)도 같은 패널에서.
function attachScreen(d, el) {
  const q = (r) => el.querySelector(`[data-r="${r}"]`);
  const panel = q("screen"), btn = q("scrBtn"), tzSel = q("tz"), tzRow = q("tzRow"), tzIn = q("tzInput"), msg = q("scrMsg");
  TZ_PRESETS.forEach(([v, l]) => tzSel.add(new Option(l, v))); tzSel.add(new Option("직접 입력...", "custom"));
  el._themeTab = null;
  btn.onclick = async () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) { await loadLayouts(d); renderScreen(d, el, LIVE[d.id || d.ip]); }
  };
  el.querySelectorAll('[data-r="tabs"] .tab').forEach((b) => { b.onclick = () => { el._themeTab = b.dataset.t; renderScreen(d, el, LIVE[d.id || d.ip]); }; });
  q("colors").onchange = async (e) => {
    const r = await deviceFetch(d.ip, `/api/settings?colors=${encodeURIComponent(e.target.value)}`, { method: "POST", timeout: 4000 });
    msg.className = "msg" + (r && r.ok ? "" : " err"); msg.textContent = r && r.ok ? (e.target.value === "kr" ? "한국식: 상승 빨강, 하락 파랑." : "글로벌: 상승 초록, 하락 빨강.") : "바꾸지 못했어요.";
    refreshDevice(d);
  };
  const saveTz = async (v) => {
    v = (v || "").trim(); if (!v) { msg.className = "msg err"; msg.textContent = "시간대를 입력해 주세요."; return; }
    const r = await deviceFetch(d.ip, `/api/settings?tz=${encodeURIComponent(v)}`, { method: "POST", timeout: 4000 });
    msg.className = "msg" + (r && r.ok ? "" : " err"); msg.textContent = r && r.ok ? "시간대를 " + v + " 로 바꿨어요." : "시간대를 바꾸지 못했어요.";
    refreshDevice(d);
  };
  tzSel.onchange = (e) => { if (e.target.value === "custom") { tzRow.classList.remove("hidden"); tzIn.focus(); return; } tzRow.classList.add("hidden"); saveTz(e.target.value); };
  q("tzSave").onclick = () => saveTz(tzIn.value);
  tzIn.onkeydown = (e) => { if (e.key === "Enter") saveTz(tzIn.value); };
}
async function loadLayouts(d) {
  const key = d.id || d.ip, live = LIVE[key];
  const c = LAYOUTS_CACHE[key];
  if (c && live && c.version === live.version) return c.list;
  const r = await deviceFetch(d.ip, "/api/layouts", { timeout: 5000 });
  if (r && r.layouts) { LAYOUTS_CACHE[key] = { version: live && live.version, list: r.layouts }; return r.layouts; }
  return c ? c.list : null;
}
function renderScreen(d, el, s) {
  const q = (r) => el.querySelector(`[data-r="${r}"]`);
  const btn = q("scrBtn"), panel = q("screen");
  if (!s || !s.layout) { btn.classList.add("hidden"); panel.classList.add("hidden"); return; }   // 옛 펌웨어
  btn.classList.remove("hidden");
  btn.querySelector('[data-r="scrSub"]').textContent = "지금 " + (s.layoutName || s.layout) + " · 색 · 시간대";
  if (panel.classList.contains("hidden")) return;
  const t = el._themeTab || s.theme || "stock";
  const list = (LAYOUTS_CACHE[d.id || d.ip] || {}).list;
  const key = t + "|" + s.layout + "|" + (list ? list.length : -1);
  if (key !== el._layoutKey) {   // 10초 폴링마다 목록을 다시 만들지 않는다 (누르는 중에 행이 바뀌지 않게)
    el._layoutKey = key;
    el.querySelectorAll('[data-r="tabs"] .tab').forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    const ul = q("llist"); ul.innerHTML = "";
    if (!list) { ul.innerHTML = '<li class="msg">레이아웃 목록을 받는 중...</li>'; loadLayouts(d).then(() => renderScreen(d, el, LIVE[d.id || d.ip])); }
    else list.filter((l) => l.theme === t).forEach((l) => {
    const li = document.createElement("li"); li.className = "lrow" + (l.id === s.layout ? " on" : "");
    li.innerHTML = `<span class="rd">${I("check")}</span><div><div class="nm">${esc(l.name)}</div><div class="ds">${esc(l.desc || "")}</div></div><span class="tg">${l.single ? "종목 전환" : "전체 표시"}</span>`;
      li.onclick = () => setLayout(d, el, l);
      ul.appendChild(li);
    });
  }
  const col = q("colors"); if (document.activeElement !== col && s.colors) col.value = s.colors;
  const tzSel = q("tz");
  if (document.activeElement !== tzSel) {
    const preset = TZ_PRESETS.find(([v]) => v === s.tz);
    tzSel.value = preset ? s.tz : "custom";
    q("tzRow").classList.toggle("hidden", !!preset);
    if (!preset && document.activeElement !== q("tzInput")) q("tzInput").value = s.tz || "";
  }
}
async function setLayout(d, el, l) {
  const key = d.id || d.ip, live = LIVE[key], msg = el.querySelector('[data-r="scrMsg"]');
  if (!live || live.layout === l.id) return;
  live.layout = l.id; live.theme = l.theme; live.layoutName = l.name; el._themeTab = null; renderScreen(d, el, live);   // 낙관적
  msg.className = "msg"; msg.textContent = l.name + " 레이아웃으로 바꾸는 중...";
  const r = await deviceFetch(d.ip, `/api/settings?layout=${encodeURIComponent(l.id)}`, { method: "POST", timeout: 4000 });
  if (r && r.ok) { msg.textContent = l.name + " 레이아웃으로 바꿨어요." + (l.theme === "clock" ? " 시계는 Wi-Fi 로 시각을 맞춰요." : ""); }
  else { msg.className = "msg err"; msg.textContent = "바꾸지 못했어요." + (r && r.error ? " (" + r.error + ")" : ""); }
  await sleep(400); refreshDevice(d);
}

function cardOf(d) { return document.querySelector(`.dev[data-key="${CSS.escape(d.id || d.ip)}"]`); }
function setDot(el, s) { const dot = el.querySelector('[data-r="dot"]'); dot.className = "dot " + s; }

function applyState(d, s) {
  d.variant = s.variant; d.id = s.id || d.id; d.host = s.host || d.host;
  const stockName = s.stockName || "";   // kstock 1.4.1+. (1.4.0 은 종목명을 "name" 으로 보내 기기 이름과 겹쳤다 → 그땐 기기 이름을 받지 않는다)
  if (s.variant !== "kstock" || s.stockName !== undefined) d.name = s.name || d.name;
  d.symbol = s.variant === "kstock" ? (stockName || s.code) : (s.base + (s.quote || ""));
  d.symbolKeyValue = s.variant === "kstock" ? s.code : s.base;
  d.priceText = s.price > 0 ? (s.variant === "kstock" ? money(s.price, s.currency) : s.priceText) : "";
  d.change = s.change; d.lastSeen = Date.now();
  if (s.ssid) d.ssid = s.ssid;   // 공유기를 바꿨어도 기기가 알려 주는 최신 이름
  if (stockName && s.code) STOCK_NAMES[s.code] = stockName;
  if (s.codes) { d.codes = s.codes; for (const sl of s.slots || []) if (sl.stockName) STOCK_NAMES[sl.code] = sl.stockName; } else delete d.codes;
  LIVE[d.id || d.ip] = s;
  saveDevices();
  let el = cardOf(d);
  // 카드 키(id, 처음엔 ip)나 기기 종류를 이제 알았으면 카드를 다시 그린다 (주식/코인에 맞는 입력 UI)
  if (!el || el.dataset.variant !== (d.variant || "")) { renderDevices(); el = cardOf(d); if (!el) return; }
  setDot(el, "on");
  el.querySelector('[data-r="name"]').textContent = fmtName(d);
  el.querySelector('[data-r="sub"]').textContent = [d.ssid ? "Wi-Fi 「" + d.ssid + "」" : "", d.ip, d.host].filter(Boolean).join(" · ");
  el.querySelector('[data-r="sym"]').textContent = d.symbol;
  el.querySelector('[data-r="price"]').textContent = d.priceText || "–";
  const c = el.querySelector('[data-r="chg"]');
  c.textContent = s.price > 0 ? (s.change >= 0 ? "+" : "") + Number(s.change).toFixed(2) + "%" : (s.error || "");
  c.className = "chg " + (s.change >= 0 ? "up" : "down");
  renderChips(d, el);
  renderList(d, el, s);
  renderScreen(d, el, s);
}

// 종목 식별자 정규화 (펌웨어 marketSanitizeSymbol 과 같은 규칙). 잘못되면 null.
// 주식: 숫자로 시작하는 6자리 영숫자는 국내 종목코드(대문자). 그 외 영문/숫자/./- 1~12자는 해외 로이터코드(TSLA.O, KO, BRKb — 대소문자 유지).
// 코인: 영문/숫자 1~12자 대문자 (뒤의 USDT 는 뗀다).
function normalizeSymbol(d, raw) {
  let v = (raw || "").trim();
  if (isStock(d)) {
    if (/^[0-9][0-9A-Za-z]{5}$/.test(v)) return v.toUpperCase();
    return /^[A-Za-z0-9.\-]{1,12}$/.test(v) ? v : null;
  }
  v = v.toUpperCase().replace(/USDT$/, "");
  return /^[A-Z0-9]{1,12}$/.test(v) ? v : null;
}
function pendingLabel(d, v) {
  if (!isStock(d)) return v + "USDT";
  return STOCK_NAMES[v] || (POPULAR.kstock.find(([c]) => c === v) || [])[1] || v;
}

async function refreshDevice(d) {
  const el = cardOf(d); if (!el) return;
  if (openOnly) { setDot(el, ""); el.querySelector('[data-r="msg"]').textContent = "이 브라우저에서는 상태를 볼 수 없어요. 「기기 설정 열기」로 바로 여세요."; return; }
  setDot(el, d.lastSeen ? "on" : "wait");
  const s = await probe(d.ip, 3000, true);
  if (s && s.version) { applyState(d, s); return; }
  if (openOnly) { refreshDevice(d); return; }   // 방금 "막힘" 으로 판정됐으면 안내로 바꿈
  setDot(el, "off");
  el.querySelector('[data-r="msg"]').textContent = "지금은 기기에 닿지 않아요. 아래 '기기가 안 열릴 때'를 확인해 보세요.";
}

async function refreshAll() {
  for (const d of devices) refreshDevice(d);   // 병렬
}

// 종목 적용. 펌웨어 1.5.0+ (목록) 이면 목록에 추가 (이미 있으면 기기 화면을 그 종목으로), 옛 펌웨어면 종목 교체.
// 낙관적 업데이트: 화면 먼저, 기기는 뒤에서. 기기가 거부하면 되돌린다.
async function applySymbol(d, raw) {
  const el = cardOf(d); const msg = el.querySelector('[data-r="msg"]');
  const v = normalizeSymbol(d, raw);
  if (!v) { msg.className = "msg err"; msg.textContent = isStock(d) ? "종목명으로 검색하거나 종목코드·티커를 입력해 주세요." : "심볼은 영문/숫자 1~12자예요."; return; }
  if (el._hideSearch) el._hideSearch();   // 칩/Enter 로 적용했으면 열려 있던 검색 결과는 닫는다
  el.querySelector('[data-r="input"]').value = "";
  const key = isStock(d) ? "code" : "base";   // 1.5.0+ 에서는 add 의 별칭. 옛 펌웨어는 종목 교체
  const multi = !!d.codes, live = LIVE[d.id || d.ip];
  if (multi && d.codes.includes(v)) {
    msg.className = "msg"; msg.textContent = pendingLabel(d, v) + " 은 이미 있어요. 기기 화면을 그 종목으로 돌려요.";
    await deviceFetch(d.ip, `/api/settings?${key}=${encodeURIComponent(v)}`, { method: "POST", timeout: 4000 });
    await sleep(400); refreshDevice(d); return;
  }
  if (multi && d.codes.length >= ((live && live.max) || 5)) { msg.className = "msg err"; msg.textContent = "종목은 최대 " + ((live && live.max) || 5) + "개까지예요. 하나를 지우고 추가해 주세요."; return; }
  const prev = { symbol: d.symbol, symbolKeyValue: d.symbolKeyValue, priceText: d.priceText };
  if (multi) { el._pending = v; renderList(d, el, live); }
  else {
    d.symbolKeyValue = v; d.symbol = pendingLabel(d, v); d.priceText = "";
    el.querySelector('[data-r="sym"]').textContent = d.symbol;
    el.querySelector('[data-r="price"]').textContent = "–";
    el.querySelector('[data-r="chg"]').textContent = "";
  }
  renderChips(d, el);
  msg.className = "msg"; msg.textContent = multi ? pendingLabel(d, v) + " 추가 중..." : "변경 중...";
  const fail = (t) => { if (multi) { el._pending = null; renderList(d, el, live); } else Object.assign(d, prev); saveDevices(); msg.className = "msg err"; msg.textContent = t; renderChips(d, el); refreshDevice(d); };
  const r = await deviceFetch(d.ip, `/api/settings?${key}=${encodeURIComponent(v)}`, { method: "POST", timeout: 4000 });
  if (r && r.ok === false) { fail(r.error && r.error.startsWith("max") ? "종목은 최대 5개까지예요." : "기기가 받지 않았어요." + (r.error ? " (" + r.error + ")" : "")); return; }
  // r 이 null 이어도 기기가 받았을 수 있다 (펌웨어 1.4.0 의 /api/settings 응답엔 CORS 헤더가 없어 브라우저가 응답만 숨긴다)
  // → 기기가 검증을 마칠 때까지 상태를 보며 확인한다 (최대 20초)
  for (let i = 0; i < 10; i++) {
    await sleep(1500);
    const s = await probe(d.ip, 2500); if (!s) continue;
    if (s.rejected && s.rejected.startsWith(v + ":")) { el._pending = null; applyState(d, s); msg.className = "msg err"; msg.textContent = (multi ? "추가 실패: " : "변경 실패: ") + s.rejected.slice(s.rejected.indexOf(":") + 1); return; }
    const slot = (s.slots || []).find((x) => x.code === v);
    const done = s.codes ? s.codes.includes(v) && !(slot && slot.validating) : (s.base === v || s.code === v) && !s.validating;
    if (done) { el._pending = null; applyState(d, s); msg.className = "msg ok"; msg.textContent = multi ? pendingLabel(d, v) + " 추가했어요." : "변경했어요."; return; }
  }
  if (!r) fail("기기에 전달하지 못했어요."); else { el._pending = null; msg.textContent = ""; }
}

function deviceMenu(d) {
  const name = prompt("기기 이름 (비우면 삭제하지 않고 이름만 지워요)\n삭제하려면 '삭제' 라고 입력", d.name || "");
  if (name === null) return;
  if (name.trim() === "삭제") { devices = devices.filter((x) => x !== d); saveDevices(); renderDevices(); toast("기기를 목록에서 뺐어요"); return; }
  d.name = name.trim().slice(0, 24); saveDevices(); renderDevices();
  if (!openOnly) deviceFetch(d.ip, `/api/settings?name=${encodeURIComponent(d.name)}`, { method: "POST" });
  refreshAll();
}

// ------------------------------------------------------------
// 기기 추가 / 찾기
// ------------------------------------------------------------
$("manualAdd").onclick = async () => {
  const ip = $("manualIp").value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { setMsg("addMsg", "주소는 192.168.0.23 같은 형식이에요.", "err"); return; }
  setMsg("addMsg", "확인 중...");
  const s = openOnly ? null : await probe(ip, 3000);
  const d = upsertDevice({ ip, id: s && s.id, host: s && s.host, name: s && s.name, variant: s && s.variant });
  renderDevices(); if (s) applyState(d, s);
  setMsg("addMsg", s ? "추가했어요." : "추가했어요. (지금은 기기에 닿지 않아요)", s ? "ok" : "");
  $("manualIp").value = "";
};

// 폰이 지금 쓰는 사설 IP 를 WebRTC ICE 후보에서 읽는다. 최근 Chrome 은 mDNS 이름으로 가려서 안 나올 수 있다 → null.
async function guessLocalIp() {
  if (!window.RTCPeerConnection) return null;
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const done = (v) => { try { pc.close(); } catch (e) {} resolve(v); };
    const t = setTimeout(() => done(null), 2000);
    pc.onicecandidate = (e) => {
      const m = e.candidate && e.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(m[1])) { clearTimeout(t); done(m[1]); }
    };
    pc.createDataChannel("x");
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => done(null));
  });
}

// 공유기 기본 대역 중 흔한 순서. 폰 IP 를 알아내면 그 대역을 맨 앞에 둔다.
const COMMON_BASES = ["192.168.0", "192.168.1", "192.168.200", "192.168.10", "192.168.100", "192.168.2", "192.168.3",
  "192.168.31", "192.168.50", "192.168.123", "192.168.8", "192.168.4", "10.0.0", "10.0.1", "172.16.0"];

let scanning = false;
$("scanBtn").onclick = async () => {
  if (openOnly) { setMsg("addMsg", "이 브라우저에서는 찾기가 안 돼요. Chrome에서 열어 주세요.", "err"); return; }
  if (scanning) { scanning = false; return; }
  scanning = true; $("scanBtn").textContent = "찾기 중지";
  const bases = [];
  const add = (b) => { if (b && !bases.includes(b)) bases.push(b); };
  const typed = $("manualIp").value.trim();
  if (/^\d{1,3}(\.\d{1,3}){2}/.test(typed)) add(typed.split(".").slice(0, 3).join("."));
  setMsg("addMsg", "폰의 네트워크 대역을 확인하는 중...");
  const mine = await guessLocalIp();
  if (mine) add(mine.replace(/\.\d+$/, ""));
  for (const d of devices) if (d.ip) add(d.ip.replace(/\.\d+$/, ""));
  for (const b of COMMON_BASES) add(b);

  let found = 0;
  outer: for (const base of bases) {
    const ips = []; for (let i = 1; i <= 254; i++) ips.push(`${base}.${i}`);
    for (let i = 0; i < ips.length; i += 32) {
      if (!scanning) break outer;
      setMsg("addMsg", `${base}.x 확인 중... (${Math.round(i / 254 * 100)}%)${found ? ` · 찾음 ${found}` : ""}${mine ? "" : " · 폰 IP를 못 읽어 흔한 대역을 차례로 봐요"}`);
      await Promise.all(ips.slice(i, i + 32).map(async (ip) => {
        const s = await probe(ip, 1500);
        if (s && s.version && s.host && s.host.startsWith("charttotem")) { const d = upsertDevice({ ip, id: s.id, host: s.host, name: s.name, variant: s.variant, ssid: s.ssid }); found++; renderDevices(); applyState(d, s); }
      }));
    }
    if (found) break;   // 같은 대역에 다 있다고 보고 멈춘다. 더 찾으려면 다시 누르면 된다
  }
  scanning = false; $("scanBtn").textContent = "같은 Wi-Fi에서 기기 찾기";
  setMsg("addMsg", found ? `${found}대를 찾았어요.` : "기기를 찾지 못했어요. 기기 화면의 QR을 찍는 게 가장 확실해요. 폰이 기기와 같은 Wi-Fi인지도 확인해 주세요.", found ? "ok" : "err");
};

// ------------------------------------------------------------
// 설치 안내
// ------------------------------------------------------------
let installPrompt = null;
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; showInstall(); });
function showInstall() {
  if (standalone) return;
  let done = false; try { done = localStorage.getItem(KEY_INSTALL) === "1"; } catch (e) {}
  if (done) return;
  $("installCard").classList.remove("hidden");
  if (installPrompt) { $("installText").textContent = "다음에 기기를 바로 열 수 있어요."; $("installBtn").classList.remove("hidden"); }
  else {
    $("installBtn").classList.add("hidden");
    $("installText").textContent = isIOS ? "Safari 아래 공유 버튼(□↑) → 「홈 화면에 추가」를 누르세요."
      : /SamsungBrowser/.test(ua) ? "아래 메뉴(≡) → 「현재 페이지 추가」 → 「홈 화면」을 누르세요."
      : "오른쪽 위 메뉴(⋮) → 「홈 화면에 추가」를 누르세요.";
  }
}
$("installBtn").onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); const r = await installPrompt.userChoice; installPrompt = null; if (r.outcome === "accepted") { try { localStorage.setItem(KEY_INSTALL, "1"); } catch (e) {} $("installCard").classList.add("hidden"); } };
$("installLater").onclick = () => $("installCard").classList.add("hidden");

// ------------------------------------------------------------
// 시작
// ------------------------------------------------------------
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function setMsg(id, t, cls) { const m = $(id); m.textContent = t; m.className = "msg" + (cls ? " " + cls : ""); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
let toastTimer; function toast(t) { const el = $("toast"); el.textContent = t; el.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add("hidden"), 2500); }

(function init() {
  $("ver").textContent = "v" + APP_VERSION; $("ver2").textContent = "v" + APP_VERSION;
  // 온보딩/QR 핸드오프
  const p = new URLSearchParams(location.search);
  if (p.get("add") || p.get("ip")) {
    const d = upsertDevice({ id: p.get("id") || "", ip: p.get("ip") || "", host: p.get("host") || "", ssid: p.get("ssid") || "" });
    history.replaceState(null, "", location.pathname);
    if (d) toast("기기를 추가했어요");
    try { localStorage.removeItem(KEY_INSTALL); } catch (e) {}   // 새 기기 등록 땐 설치 안내 다시
  }
  openOnly = !lnaLikely && !lnaOption;
  $("browserCard").classList.toggle("hidden", !openOnly);
  renderDevices();
  refreshAll();
  if (!openOnly) refreshTimer = setInterval(refreshAll, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
  setTimeout(showInstall, 1500);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
