// 차트토템 런처 (GitHub Pages, HTTPS) — 기기 관리 전용 (0.5.0)
// - 기기 목록은 localStorage. 온보딩 성공 페이지/기기 QR 이 ?add=1&id=&ip=&host=&ssid= 로 넘겨주면 자동 등록.
// - 기기 통신은 HTTP(사설 IP) 라서 HTTPS 페이지에서는 원래 막히지만, Chrome 141+ 의 Local Network Access
//   (fetch 에 targetAddressSpace 옵션) 로 허용된다 (권한 창 1회). 안 되는 브라우저는 "열기만" 모드.
// - 종목·화면 설정은 기기 설정 페이지(http://<기기IP>/)에서 한다. 런처는 연결 상태 확인, 이름, 추가/삭제, 설정 페이지 열기만.
const APP_VERSION = "0.5.0";
const KEY_DEVICES = "ct.devices";
const KEY_INSTALL = "ct.installDone";
const KEY_LNA = "ct.lnaOption";

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
  $("browserCard").querySelector(".msg").innerHTML = "이 브라우저는 기기와 직접 통신을 막아요. <b>기기 설정 열기</b>는 되지만 연결 상태는 안 보여요. 안드로이드는 <b>Chrome 141 이상</b>에서 열면 돼요 (처음 한 번 '로컬 네트워크 접근' 허용).";
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
// 화면: 기기 항목 = 프로필(상태 점 · 이름 · Wi-Fi/주소) + ⋯ 메뉴 + 요약 한 줄 + 「기기 설정 열기」
// ------------------------------------------------------------
function fmtName(d) { return d.name || (d.id ? `차트토템 ${d.id.slice(-4)}` : d.ip); }

function renderDevices() {
  const box = $("devices");
  box.innerHTML = "";
  $("emptyCard").classList.toggle("hidden", devices.length > 0);
  for (const d of devices) {
    const el = document.createElement("section");
    el.className = "dev";
    el.dataset.key = d.id || d.ip;
    el.innerHTML = `
      <div class="profile"><span class="dot" data-r="dot"></span><div class="ptext"><div class="pname" data-r="name">${esc(fmtName(d))}</div><div class="psub" data-r="sub">${esc(subOf(d))}</div></div><button class="more" data-r="more" title="이름 바꾸기 · 삭제" aria-label="더보기">${I("more")}</button></div>
      <div class="msg" data-r="msg">${esc(summaryOf(d))}</div>
      <nav class="list">
        <a class="menu" href="http://${esc(d.ip)}/" target="_blank" rel="noopener">${I("settings")}<span class="mtext"><span class="mlbl">기기 설정 열기</span><span class="msub">종목 · 화면 · Wi-Fi · 시스템 설정은 기기 페이지에서</span></span></a>
        ${d.host ? `<a class="menu" href="http://${esc(d.host)}/" target="_blank" rel="noopener">${I("external-link")}<span class="mtext"><span class="mlbl">${esc(d.host)}</span><span class="msub">아이폰 · 맥에서는 이 주소로도 열려요</span></span></a>` : ""}
      </nav>
      <div class="band"></div>`;
    el.querySelector('[data-r="more"]').onclick = () => deviceMenu(d);
    box.appendChild(el);
  }
}
function subOf(d) { return [d.ssid ? "Wi-Fi " + d.ssid : "", d.ip].filter(Boolean).join(" · "); }
// 기기가 알려 준 요약: 펌웨어 · 레이아웃 · 종목 수 · 표시 중 종목 (설정은 기기 페이지에서)
function summaryOf(d) {
  if (!d.lastSeen) return "";
  const parts = [];
  if (d.version) parts.push("v" + d.version);
  if (d.layoutName) parts.push(d.layoutName);
  if (d.symbolCount != null) parts.push("종목 " + d.symbolCount + "개");
  if (d.symbol) parts.push(d.symbol);
  return parts.join(" · ");
}

function cardOf(d) { return document.querySelector(`.dev[data-key="${CSS.escape(d.id || d.ip)}"]`); }
function setDot(el, s) { const dot = el.querySelector('[data-r="dot"]'); dot.className = "dot " + s; }

function applyState(d, s) {
  d.variant = s.variant; d.id = s.id || d.id; d.host = s.host || d.host;
  if (s.variant !== "kstock" || s.stockName !== undefined) d.name = s.name || d.name;   // kstock 1.4.0 은 종목명을 name 으로 보냈다
  d.version = s.version; d.layoutName = s.layoutName || ""; d.symbolCount = s.codes ? s.codes.length : (s.symbol ? 1 : 0);
  d.symbol = s.variant === "kstock" ? (s.stockName || s.code || "") : (s.base ? s.base + (s.quote || "") : "");
  d.lastSeen = Date.now();
  if (s.ssid) d.ssid = s.ssid;   // 공유기를 바꿨어도 기기가 알려 주는 최신 이름
  saveDevices();
  let el = cardOf(d);
  if (!el) { renderDevices(); el = cardOf(d); if (!el) return; }
  setDot(el, "on");
  el.querySelector('[data-r="name"]').textContent = fmtName(d);
  el.querySelector('[data-r="sub"]').textContent = subOf(d);
  const m = el.querySelector('[data-r="msg"]'); m.className = "msg"; m.textContent = summaryOf(d);
}

async function refreshDevice(d) {
  const el = cardOf(d); if (!el) return;
  if (openOnly) { setDot(el, ""); el.querySelector('[data-r="msg"]').textContent = "이 브라우저에서는 상태를 볼 수 없어요. 「기기 설정 열기」로 바로 여세요."; return; }
  setDot(el, d.lastSeen ? "on" : "wait");
  const s = await probe(d.ip, 3000, true);
  if (s && s.version) { applyState(d, s); return; }
  if (openOnly) { refreshDevice(d); return; }   // 방금 "막힘" 으로 판정됐으면 안내로 바꿈
  setDot(el, "off");
  const m = el.querySelector('[data-r="msg"]'); m.className = "msg err"; m.textContent = "지금은 기기에 닿지 않아요. 아래 '기기가 안 열릴 때'를 확인해 보세요.";
}

async function refreshAll() {
  for (const d of devices) refreshDevice(d);   // 병렬
}

function deviceMenu(d) {
  const name = prompt("기기 이름 (비우면 삭제하지 않고 이름만 지워요)\n목록에서 빼려면 '삭제' 라고 입력", d.name || "");
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
  scanning = true; $("scanLabel").textContent = "찾기 중지";
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
  scanning = false; $("scanLabel").textContent = "같은 Wi-Fi에서 기기 찾기";
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
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function setMsg(id, t, cls) { const m = $(id); m.textContent = t; m.className = "msg" + (cls ? " " + cls : ""); }
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
