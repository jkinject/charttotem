// 차트토템 런처 (GitHub Pages, HTTPS)
// - 기기 목록은 localStorage. 온보딩 성공 페이지/기기 QR 이 ?add=1&id=&ip=&host=&ssid= 로 넘겨주면 자동 등록.
// - 기기 통신은 HTTP(사설 IP) 라서 HTTPS 페이지에서는 원래 막히지만, Chrome 141+ 의 Local Network Access
//   (fetch 에 targetAddressSpace 옵션) 로 허용된다 (권한 창 1회). 안 되는 브라우저는 "열기만" 모드.
const APP_VERSION = "0.1.3";
const KEY_DEVICES = "ct.devices";
const KEY_INSTALL = "ct.installDone";
const KEY_LNA = "ct.lnaOption";
const POPULAR = {
  coin: ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "SUI", "PEPE"],
  kstock: [["005930", "삼성전자"], ["000660", "SK하이닉스"], ["373220", "LG엔솔"], ["005380", "현대차"], ["035420", "NAVER"], ["035720", "카카오"]],
};

const $ = (id) => document.getElementById(id);
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
function markBlocked() {
  if (++blockedHits < 2 || openOnly) return;
  openOnly = true;
  clearInterval(refreshTimer);
  $("browserCard").classList.remove("hidden");
  $("browserCard").querySelector(".msg").innerHTML = "이 브라우저는 기기와 직접 통신을 막아요. <b>기기 설정 열기</b>는 되지만 가격·연결 상태는 안 보여요. 안드로이드는 <b>Chrome 141 이상</b>에서 열면 돼요 (처음 한 번 '로컬 네트워크 접근' 허용).";
  renderDevices();
}

async function deviceFetch(ip, path, { method = "GET", timeout = 2500 } = {}) {
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
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      if (e.name === "AbortError") return null;   // 타임아웃: 옵션 문제가 아니라 기기가 안 닿는 것
    }
  }
  if (Date.now() - started < 400) markBlocked();  // 모든 시도가 즉시 실패 = 브라우저가 막음
  return null;
}

async function probe(ip, timeout) { return deviceFetch(ip, "/api/state", { timeout }); }

// ------------------------------------------------------------
// 화면
// ------------------------------------------------------------
function fmtName(d) { return d.name || (d.id ? `차트토템 ${d.id.slice(-4)}` : d.ip); }

function renderDevices() {
  const box = $("devices");
  box.innerHTML = "";
  $("emptyCard").classList.toggle("hidden", devices.length > 0);
  for (const d of devices) {
    const el = document.createElement("div");
    el.className = "card dev";
    el.dataset.key = d.id || d.ip;
    const sub = [d.ssid ? "Wi-Fi 「" + d.ssid + "」" : "", d.ip, d.host].filter(Boolean).join(" · ");
    el.innerHTML = `
      <div class="menu"><button title="더보기">⋯</button></div>
      <div class="dev-head"><span class="dot" data-r="dot"></span><div class="dev-name" data-r="name">${esc(fmtName(d))}</div></div>
      <div class="dev-sub" data-r="sub">${esc(sub)}</div>
      <div class="hero"><span class="sym" data-r="sym">${d.symbol ? esc(d.symbol) : ""}</span><span class="price" data-r="price">${d.priceText ? esc(d.priceText) : "–"}</span><span class="chg" data-r="chg"></span></div>
      <div class="chips" data-r="chips"></div>
      <div class="row"><input type="text" data-r="input" placeholder="${d.variant === "kstock" ? "종목코드 6자리" : "심볼 (예: ARB)"}" maxlength="12"><button class="small lav" data-r="apply">변경</button></div>
      <div class="msg" data-r="msg"></div>
      <div class="dev-actions">
        <a href="http://${esc(d.ip)}/" target="_blank" rel="noopener"><button class="small primary">기기 설정 열기</button></a>
        ${d.host ? `<a href="http://${esc(d.host)}/" target="_blank" rel="noopener"><button class="small ghost">${esc(d.host)}</button></a>` : ""}
      </div>`;
    el.querySelector(".menu button").onclick = () => deviceMenu(d);
    el.querySelector('[data-r="apply"]').onclick = () => applySymbol(d, el.querySelector('[data-r="input"]').value);
    el.querySelector('[data-r="input"]').onkeydown = (e) => { if (e.key === "Enter") applySymbol(d, e.target.value); };
    renderChips(d, el);
    box.appendChild(el);
  }
}

function renderChips(d, el) {
  const chips = el.querySelector('[data-r="chips"]');
  chips.innerHTML = "";
  const list = d.variant === "kstock" ? POPULAR.kstock : POPULAR.coin;
  for (const item of list) {
    const [v, label] = Array.isArray(item) ? item : [item, item];
    const c = document.createElement("button");
    c.className = "chip" + (d.symbol === v || d.symbolKeyValue === v ? " on" : "");
    c.textContent = label;
    c.onclick = () => applySymbol(d, v);
    chips.appendChild(c);
  }
}

function cardOf(d) { return document.querySelector(`.dev[data-key="${CSS.escape(d.id || d.ip)}"]`); }
function setDot(el, s) { const dot = el.querySelector('[data-r="dot"]'); dot.className = "dot " + s; }

function applyState(d, s) {
  d.variant = s.variant; d.id = s.id || d.id; d.host = s.host || d.host; d.name = s.name || d.name;
  d.symbol = s.variant === "kstock" ? (s.name_stock || s.code) : (s.base + (s.quote || ""));
  d.symbolKeyValue = s.variant === "kstock" ? s.code : s.base;
  d.priceText = s.price > 0 ? s.priceText + (s.variant === "kstock" ? " 원" : "") : "";
  d.change = s.change; d.lastSeen = Date.now();
  if (s.ssid) d.ssid = s.ssid;   // 공유기를 바꿨어도 기기가 알려 주는 최신 이름
  saveDevices();
  const el = cardOf(d); if (!el) return;
  setDot(el, "on");
  el.querySelector('[data-r="name"]').textContent = fmtName(d);
  el.querySelector('[data-r="sub"]').textContent = [d.ssid ? "Wi-Fi 「" + d.ssid + "」" : "", d.ip, d.host].filter(Boolean).join(" · ");
  el.querySelector('[data-r="sym"]').textContent = s.variant === "kstock" ? (s.name || s.code) : d.symbol;
  el.querySelector('[data-r="price"]').textContent = d.priceText || "–";
  const c = el.querySelector('[data-r="chg"]');
  c.textContent = s.price > 0 ? (s.change >= 0 ? "+" : "") + Number(s.change).toFixed(2) + "%" : (s.error || "");
  c.className = "chg " + (s.change >= 0 ? "up" : "down");
  el.querySelector('[data-r="input"]').placeholder = d.variant === "kstock" ? "종목코드 6자리" : "심볼 (예: ARB)";
  renderChips(d, el);
}

async function refreshDevice(d) {
  const el = cardOf(d); if (!el) return;
  if (openOnly) { setDot(el, ""); el.querySelector('[data-r="msg"]').textContent = "이 브라우저에서는 상태를 볼 수 없어요. 「기기 설정 열기」로 바로 여세요."; return; }
  setDot(el, d.lastSeen ? "on" : "wait");
  const s = await probe(d.ip, 3000);
  if (s && s.version) { applyState(d, s); return; }
  if (openOnly) { refreshDevice(d); return; }   // 방금 "막힘" 으로 판정됐으면 안내로 바꿈
  setDot(el, "off");
  el.querySelector('[data-r="msg"]').textContent = "지금은 기기에 닿지 않아요. 아래 '기기가 안 열릴 때'를 확인해 보세요.";
}

async function refreshAll() {
  for (const d of devices) refreshDevice(d);   // 병렬
}

// 낙관적 업데이트: 화면 먼저, 기기는 뒤에서. 기기가 거부하면 되돌린다.
async function applySymbol(d, raw) {
  const el = cardOf(d); const msg = el.querySelector('[data-r="msg"]');
  let v = (raw || "").trim().toUpperCase();
  if (d.variant === "coin") v = v.replace(/USDT$/, "");
  const valid = d.variant === "kstock" ? /^[0-9A-Z]{6}$/.test(v) : /^[A-Z0-9]{1,12}$/.test(v);
  if (!valid) { msg.className = "msg err"; msg.textContent = d.variant === "kstock" ? "종목코드는 6자리예요." : "심볼은 영문/숫자 1~12자예요."; return; }
  const key = d.variant === "kstock" ? "code" : "base";
  const prev = { symbol: d.symbol, symbolKeyValue: d.symbolKeyValue, priceText: d.priceText };
  d.symbolKeyValue = v; d.symbol = d.variant === "kstock" ? v : v + "USDT"; d.priceText = "";
  el.querySelector('[data-r="sym"]').textContent = d.symbol;
  el.querySelector('[data-r="price"]').textContent = "–";
  el.querySelector('[data-r="chg"]').textContent = "";
  el.querySelector('[data-r="input"]').value = "";
  renderChips(d, el);
  msg.className = "msg"; msg.textContent = "변경 중...";
  const r = await deviceFetch(d.ip, `/api/settings?${key}=${encodeURIComponent(v)}`, { method: "POST", timeout: 4000 });
  if (!r || !r.ok) { Object.assign(d, prev); msg.className = "msg err"; msg.textContent = "기기에 전달하지 못했어요."; renderChips(d, el); return; }
  // 기기가 검증을 마칠 때까지 상태를 본다 (최대 20초)
  for (let i = 0; i < 10; i++) {
    await sleep(1500);
    const s = await probe(d.ip, 2500); if (!s) continue;
    if (s.rejected && s.rejected.startsWith(v + ":")) { applyState(d, s); msg.className = "msg err"; msg.textContent = "변경 실패: " + s.rejected.slice(s.rejected.indexOf(":") + 1); return; }
    if ((s.base === v || s.code === v) && !s.validating) { applyState(d, s); msg.className = "msg ok"; msg.textContent = "변경했어요."; return; }
  }
  msg.textContent = "";
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
  $("ver").textContent = "v" + APP_VERSION;
  // 온보딩/QR 핸드오프
  const p = new URLSearchParams(location.search);
  if (p.get("add") || p.get("ip")) {
    const d = upsertDevice({ id: p.get("id") || "", ip: p.get("ip") || "", host: p.get("host") || "", ssid: p.get("ssid") || "" });
    history.replaceState(null, "", location.pathname);
    if (d) toast("기기를 추가했어요");
    try { localStorage.removeItem(KEY_INSTALL); } catch (e) {}   // 새 기기 등록 땐 설치 안내 다시
  }
  openOnly = !lnaLikely;
  $("browserCard").classList.toggle("hidden", !openOnly);
  renderDevices();
  refreshAll();
  if (!openOnly) refreshTimer = setInterval(refreshAll, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
  setTimeout(showInstall, 1500);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
