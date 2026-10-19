// 차트토템 런처 (GitHub Pages, HTTPS) — 0.6: 클라우드 페어링
// - 고객은 기기 IP 를 모른다. 기기 화면의 ID 6자리 + 화면에 뜨는 숫자 코드로 연결하면(cloud/API.md 페어링) 토큰을 받아
//   어디서든(집 밖에서도) 설정 페이지(settings-<variant>.html?id=)를 연다. 설정 요청은 cloud_shim.js 가 Worker 로 보낸다.
// - 기기 목록은 localStorage ct.cloudDevices [{id, token, name, variant, addedAt}].
// - IP 직접 연결(LNA, 같은 Wi-Fi)은 개발자 모드(버전 7번 탭 또는 ?dev=1)에서만. 옛 ct.devices 는 거기서만 보인다.
const APP_VERSION = "0.7.33";
const CLOUD = "https://charttotem-cloud.jkinject.workers.dev";
const KEY_CLOUD = "ct.cloudDevices";
const KEY_DEVICES = "ct.devices";     // 개발자 모드: IP 기기
const KEY_INSTALL = "ct.installDone";
const KEY_LNA = "ct.lnaOption";
const KEY_DEV = "ct.dev";

const $ = (id) => document.getElementById(id);
const I = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function setMsg(id, t, cls) { const m = $(id); if (!m) return; m.textContent = t || ""; m.className = "msg" + (cls ? " " + cls : ""); }
let toastTimer; function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 2500); }
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let cloudDevices = load(KEY_CLOUD);
let devMode = false; try { devMode = localStorage.getItem(KEY_DEV) === "1"; } catch (e) {}

// ------------------------------------------------------------
// 라우팅: #/ 홈, #/add 기기 연결
// ------------------------------------------------------------
const PAGES = ["/", "/add"];
function page() { const p = location.hash.slice(1) || "/"; return PAGES.includes(p.split("?")[0]) ? p.split("?")[0] : "/"; }
function go(p) { location.hash = "#" + p; }
function route() {
  const p = page();
  document.querySelectorAll(".page").forEach((x) => x.classList.toggle("on", x.dataset.page === p));
  scrollTo(0, 0);
  if (p === "/add") { const q = new URLSearchParams((location.hash.split("?")[1] || "")); if (q.get("id")) $("pairId").value = q.get("id").toUpperCase(); pairReset(false); setTimeout(() => ($("pairId").value ? $("pairNext") : $("pairId")).focus(), 50); }
  else { pairStop(); }
}
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { go(g.dataset.go); return; } if (e.target.closest(".back")) { history.length > 1 ? history.back() : go("/"); } });
window.addEventListener("hashchange", route);

// ------------------------------------------------------------
// 클라우드 API
// ------------------------------------------------------------
async function api(path, { method = "GET", body, token, timeout = 8000 } = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = "Bearer " + token;
    const r = await fetch(CLOUD + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: ac.signal });
    const j = await r.json().catch(() => ({ ok: false, error: "HTTP " + r.status }));
    j._status = r.status;
    return j;
  } catch (e) { return { ok: false, error: e.name === "AbortError" ? "timeout" : "network" }; }
  finally { clearTimeout(t); }
}

// ------------------------------------------------------------
// 기기 목록
// ------------------------------------------------------------
function fmtName(d) { return d.name || `차트토템 ${(d.id || "").slice(-4)}`; }
function variantLabel(v) { return v === "coin" ? "코인" : v === "kstock" ? "주식" : ""; }
function settingsUrl(d, hash) { return `settings-${d.variant === "coin" ? "coin" : "kstock"}.html?id=${encodeURIComponent(d.id)}${hash ? "#" + hash : ""}`; }
// 기기 섬네일: 기기 모양(둥근 검은 정사각) 안에 ORBIT 느낌의 고리와 점. 실제 화면이 아니라 상징이다 (실제 미리보기는 설정 페이지에)
// 섬네일 이미지는 branding/launcher-home/device.png (Codex 생성) → icons/device.png. 없으면 아래 SVG 로 폴백
const THUMB = `<img src="icons/device.png" alt="" onerror="this.remove()"><svg viewBox="0 0 72 72" aria-hidden="true"><rect x="2" y="2" width="68" height="68" rx="14" fill="#0b0b0e"/><rect x="8" y="8" width="56" height="56" rx="9" fill="#141418"/>
  <circle cx="36" cy="33" r="17" fill="none" stroke="#3a3d3a" stroke-width="1.2"/><circle cx="36" cy="16" r="2.6" fill="#e34f55"/><circle cx="51" cy="41" r="2.6" fill="#3978d4"/><circle cx="21" cy="41" r="2.6" fill="#4fbf9a"/>
  <rect x="26" y="30" width="20" height="6" rx="1.5" fill="#e8e8ec"/><rect x="14" y="54" width="44" height="3" rx="1.5" fill="#3a3d3a"/></svg>`;
// 3개 빠른 메뉴: 기기 설정(홈) · 화면 관리(#/screen 종목·레이아웃) · 네트워크(#/wifi)
const TILES = [["settings", "기기 설정", "종목 · 화면 · 시스템", ""], ["monitor", "화면 관리", "종목 · 레이아웃", "/screen"], ["wifi", "네트워크", "Wi-Fi 설정", "/wifi"]];
function setTileLinks(el, d) { el.querySelectorAll(".tile").forEach((a, i) => { a.href = settingsUrl(d, TILES[i][3]); }); }
function setStatus(el, kind, text) { const st = el.querySelector('[data-r="st"]'); st.className = "st " + kind; st.textContent = text; }
function agoText(sec) { if (sec == null) return ""; return sec < 90 ? sec + "초 전" : sec < 5400 ? Math.round(sec / 60) + "분 전" : sec < 172800 ? Math.round(sec / 3600) + "시간 전" : Math.round(sec / 86400) + "일 전"; }

function renderDevices() {
  const box = $("devices");
  box.innerHTML = "";
  const none = cloudDevices.length === 0;
  $("emptyCard").classList.toggle("hidden", !none);
  $("addNav").classList.toggle("hidden", none);   // 연결 전엔 큰 「기기 연결하기」 버튼이 있으니 행은 숨긴다
  for (const d of cloudDevices) {
    const el = document.createElement("section");
    el.className = "dev card";
    el.dataset.key = d.id;
    el.innerHTML = `
      <div class="devhead">
        <div class="thumb">${THUMB}</div>
        <div class="dtext">
          <div class="drow"><span class="pname" data-r="name">${esc(fmtName(d))}</span><span class="st wait" data-r="st">확인 중</span></div>
          <div class="psub"><span>ID ${esc(d.id)}</span>${d.variant ? `<span class="badge">${esc(variantLabel(d.variant))}</span>` : ""}</div>
        </div>
        <button class="more" data-r="more" title="이름 바꾸기 · 기기 삭제" aria-label="더보기">${I("more")}</button>
      </div>
      <div class="msg hidden" data-r="msg"></div>
      <div class="tiles" data-r="tiles">${TILES.map(([ic, l, s]) => `<a class="tile">${I(ic)}<b>${l}</b><span>${s}</span></a>`).join("")}</div>
      `;
    setTileLinks(el, d);
    el.querySelector('[data-r="more"]').onclick = () => deviceMenu(d);
    box.appendChild(el);
  }
}
function cardOf(d) { return document.querySelector(`.dev[data-key="${CSS.escape(d.id)}"]`); }

async function refreshDevice(d) {
  const el = cardOf(d); if (!el) return;
  const info = await api(`/p/${d.id}/info`, { token: d.token });
  const m = el.querySelector('[data-r="msg"]'), tiles = el.querySelector('[data-r="tiles"]');
  if (info._status === 401) {   // 토큰이 폐기됐다 (기기 초기화 등)
    setStatus(el, "off", "연결 해제"); m.className = "msg err"; m.textContent = "연결이 해제됐어요. 「기기 연결」에서 다시 연결해 주세요.";
    tiles.classList.add("disabled"); d.lost = true; save(KEY_CLOUD, cloudDevices); return;
  }
  if (!info.ok) { setStatus(el, "wait", "확인 중"); m.className = "msg"; m.textContent = "서버에 닿지 않아요. 인터넷 연결을 확인해 주세요."; return; }
  d.lost = false;
  if (info.name !== undefined && info.name !== d.name) d.name = info.name;
  if (info.variant && info.variant !== d.variant) { d.variant = info.variant; setTileLinks(el, d); }
  d.fw = info.fw; d.online = info.online; d.age = info.age; d.lastSeen = Date.now();
  save(KEY_CLOUD, cloudDevices);
  el.querySelector('[data-r="name"]').textContent = fmtName(d);
  tiles.classList.remove("disabled");
  // 상태는 이름 옆 알약 글자로. 문제가 있을 때만 한 줄 더 (정보 과잉 방지)
  if (info.online) { setStatus(el, "on", "연결됨"); m.className = "msg hidden"; m.textContent = ""; }
  else { setStatus(el, "off", "오프라인"); m.className = "msg err"; m.textContent = "오프라인" + (info.age != null ? " · 마지막 연결 " + agoText(info.age) : "") + " · 아래 도움말 참고"; }
}
function refreshAll() { for (const d of cloudDevices) refreshDevice(d); }

function deviceMenu(d) {
  // ⋯ 메뉴: 이름 바꾸기 / 기기 삭제 (삭제는 confirm 뒤에만). 바닥 시트 하나를 재사용한다.
  let sh = $("sheet");
  if (!sh) { sh = document.createElement("div"); sh.id = "sheet"; sh.className = "sheet-bd"; document.body.appendChild(sh); }
  sh.innerHTML = `<div class="sheet" role="menu"><div class="sheet-title">${esc(fmtName(d))} · ID ${esc(d.id)}</div>
    <button role="menuitem" data-a="rename">${I("pencil")}이름 바꾸기</button>
    <button role="menuitem" class="danger" data-a="remove">${I("trash")}기기 삭제</button>
    <button role="menuitem" class="cancel" data-a="cancel">취소</button></div>`;
  const close = () => { sh.classList.remove("on"); setTimeout(() => { sh.innerHTML = ""; }, 200); };
  sh.onclick = (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a || (e.target === sh ? "cancel" : null);
    if (!a) return;
    close();
    if (a === "rename") renameDevice(d);
    else if (a === "remove") removeDevice(d);
  };
  requestAnimationFrame(() => sh.classList.add("on"));
}
function renameDevice(d) {
  // 카드의 이름 글자가 그 자리에서 입력칸으로 바뀐다 (Enter/✓ 저장, Esc 취소, 포커스 빠져도 저장)
  const el = document.querySelector(`.dev[data-key="${d.id}"] [data-r="name"]`);
  if (!el || el.querySelector("input")) return;
  const cur = d.name || "";
  el.innerHTML = `<input class="pname-edit" maxlength="24" placeholder="기기 이름" aria-label="기기 이름"><button class="editbtn on" aria-label="저장">${I("check")}</button>`;
  const inp = el.querySelector("input"), btn = el.querySelector("button");
  inp.value = cur;
  let done = false;
  const finish = (commit) => {
    if (done) return; done = true;
    const v = inp.value.trim().slice(0, 24);
    if (!commit || v === cur) { el.textContent = fmtName(d); return; }
    d.name = v; save(KEY_CLOUD, cloudDevices); renderDevices();
    api(`/p/${d.id}/settings?name=${encodeURIComponent(v)}`, { method: "POST", token: d.token }).then((r) => { if (r.ok) toast("이름을 바꿨어요. 기기에 곧 반영돼요"); });
    refreshAll();
  };
  btn.onclick = () => finish(true);
  inp.onkeydown = (e) => { if (e.key === "Enter") finish(true); else if (e.key === "Escape") finish(false); };
  inp.onblur = () => setTimeout(() => finish(true), 150);
  inp.focus(); inp.select();
}
function removeDevice(d) {
  if (!confirm(`'${fmtName(d)}' 기기를 이 폰에서 삭제할까요?\n기기 자체 설정은 그대로예요. 「기기 연결」로 다시 연결할 수 있어요.`)) return;
  api(`/p/${d.id}/token`, { method: "DELETE", token: d.token });
  cloudDevices = cloudDevices.filter((x) => x !== d); save(KEY_CLOUD, cloudDevices); renderDevices(); toast("기기를 삭제했어요");
}

// ------------------------------------------------------------
// 기기 연결 (페어링): ID → 서버가 기기 화면에 PIN → PIN 입력 → 토큰
// ------------------------------------------------------------
let pairTimer = null, pairingId = null;
function pairStop() { clearInterval(pairTimer); pairTimer = null; }
function pairReset(clearId) {
  pairStop(); pairingId = null;
  $("stepId").classList.remove("hidden"); $("stepPin").classList.add("hidden");
  if (clearId) $("pairId").value = "";
  $("pairPin").value = ""; setMsg("pairMsg1", ""); setMsg("pairMsg2", "");
  $("pairNext").disabled = false; $("pairConfirm").disabled = false;
}
$("pairId").oninput = (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6); };
$("pairId").onkeydown = (e) => { if (e.key === "Enter") $("pairNext").click(); };
$("pairPin").oninput = (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); if (e.target.value.length === 6) $("pairConfirm").click(); };
$("pairPin").onkeydown = (e) => { if (e.key === "Enter") $("pairConfirm").click(); };
$("pairRestart").onclick = () => pairReset(false);

$("pairNext").onclick = async () => {
  const id = $("pairId").value.trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(id)) { setMsg("pairMsg1", "ID 는 숫자와 A~F 로 된 6자리예요. 기기 화면 아래쪽을 봐 주세요.", "err"); return; }
  const have = cloudDevices.find((d) => d.id === id && !d.lost);
  if (have) { setMsg("pairMsg1", `${fmtName(have)} 은(는) 이미 연결돼 있어요.`, "ok"); return; }
  $("pairNext").disabled = true; setMsg("pairMsg1", "기기를 찾는 중...");
  const ping = await api(`/p/${id}/ping`);
  if (!ping.ok) { setMsg("pairMsg1", "서버에 닿지 않아요. 인터넷 연결을 확인하고 다시 시도해 주세요.", "err"); $("pairNext").disabled = false; return; }
  if (!ping.registered) { setMsg("pairMsg1", "이 ID 의 기기를 찾을 수 없어요. ID 를 다시 확인해 주세요. 기기가 아직 한 번도 Wi-Fi 에 연결된 적이 없으면 먼저 기기 화면의 Wi-Fi QR 로 연결해 주세요.", "err"); $("pairNext").disabled = false; return; }
  if (!ping.online) { setMsg("pairMsg1", "기기가 지금 꺼져 있거나 Wi-Fi 에 연결되지 않았어요. 기기 화면을 확인한 뒤 다시 눌러 주세요.", "err"); $("pairNext").disabled = false; return; }
  const r = await api("/p/pair/start", { method: "POST", body: { id } });
  $("pairNext").disabled = false;
  if (!r.ok) {
    setMsg("pairMsg1", r.error === "offline" ? "기기가 오프라인이에요. 전원과 Wi-Fi 를 확인해 주세요." : r.error === "rate" ? "잠시 뒤에 다시 시도해 주세요 (요청이 너무 잦아요)." : "연결을 시작하지 못했어요: " + r.error, "err");
    return;
  }
  pairingId = id;
  $("stepId").classList.add("hidden"); $("stepPin").classList.remove("hidden");
  $("pinStatus").textContent = ping.pairing === "shown" ? "기기 화면에 숫자가 떠 있어요." : "기기 화면에 숫자 6자리가 뜨길 기다리는 중이에요... (최대 30초)";
  setTimeout(() => $("pairPin").focus(), 50);
  pairStop();
  pairTimer = setInterval(async () => {   // 기기가 PIN 을 받아 화면에 띄웠는지
    if (!pairingId) return pairStop();
    const p = await api(`/p/${pairingId}/ping`);
    if (p.ok && p.pairing === "shown") { $("pinStatus").textContent = "기기 화면에 숫자가 떴어요. 그 숫자를 입력하세요."; pairStop(); }
    else if (p.ok && p.pairing === null) { $("pinStatus").textContent = "코드가 만료됐어요. 「처음부터」를 눌러 다시 시작해 주세요."; pairStop(); }
  }, 3000);
};

$("pairConfirm").onclick = async () => {
  const pin = $("pairPin").value.trim();
  if (!/^\d{6}$/.test(pin)) { setMsg("pairMsg2", "기기 화면의 숫자 6자리를 입력해 주세요.", "err"); return; }
  if (!pairingId) { pairReset(false); return; }
  $("pairConfirm").disabled = true; setMsg("pairMsg2", "확인 중...");
  const r = await api("/p/pair/confirm", { method: "POST", body: { id: pairingId, pin, label: navigator.userAgent.slice(0, 60) } });
  $("pairConfirm").disabled = false;
  if (!r.ok) {
    setMsg("pairMsg2", r.error === "pin" ? `숫자가 달라요. 기기 화면을 다시 봐 주세요. (남은 시도 ${r.left}회)` : r.error === "expired" ? "코드가 만료됐어요. 「처음부터」를 눌러 다시 시작해 주세요." : "연결하지 못했어요: " + r.error, "err");
    $("pairPin").value = ""; $("pairPin").focus(); return;
  }
  pairStop();
  cloudDevices = cloudDevices.filter((d) => d.id !== r.id);
  cloudDevices.unshift({ id: r.id, token: r.token, name: r.name || "", variant: r.variant || "", addedAt: Date.now() });
  save(KEY_CLOUD, cloudDevices);
  try { localStorage.removeItem(KEY_INSTALL); } catch (e) {}
  renderDevices(); refreshAll();
  toast("기기를 연결했어요");
  pairReset(true);
  go("/");
};

// ------------------------------------------------------------
// 개발자 모드: IP 직접 연결 (LNA). 고객 흐름과 무관
// ------------------------------------------------------------
let ipDevices = load(KEY_DEVICES), lnaOption = null, scanning = false;
try { lnaOption = JSON.parse(localStorage.getItem(KEY_LNA)); } catch (e) {}
async function deviceFetch(ip, path, { method = "GET", timeout = 2500 } = {}) {
  const url = `http://${ip}${path}`;
  const candidates = lnaOption ? [lnaOption] : [{ targetAddressSpace: "local" }, { targetAddressSpace: "private" }, {}];
  for (const opt of candidates) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
    try { const r = await fetch(url, { method, cache: "no-store", signal: ac.signal, ...opt }); clearTimeout(t); if (!lnaOption) { lnaOption = opt; save(KEY_LNA, opt); } return await r.json(); }
    catch (e) { clearTimeout(t); if (e.name === "AbortError") return null; }
  }
  return null;
}
const probe = (ip, timeout) => deviceFetch(ip, "/api/state", { timeout });
function renderIpDevices() {
  const box = $("ipDevices"); box.innerHTML = "";
  for (const d of ipDevices) {
    const a = document.createElement("a"); a.className = "menu"; a.href = `http://${d.ip}/`; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = `${I("external-link")}<span class="mtext"><span class="mlbl">${esc(d.name || d.id || d.ip)}</span><span class="msub">http://${esc(d.ip)}/ ${d.id ? "· " + esc(d.id) : ""}</span></span>`;
    a.oncontextmenu = (e) => { e.preventDefault(); if (confirm(d.ip + " 을(를) 목록에서 뺄까요?")) { ipDevices = ipDevices.filter((x) => x !== d); save(KEY_DEVICES, ipDevices); renderIpDevices(); } };
    box.appendChild(a);
  }
}
function upsertIp(d) { let cur = ipDevices.find((x) => x.ip === d.ip); if (!cur) { cur = { addedAt: Date.now() }; ipDevices.unshift(cur); } Object.assign(cur, d); save(KEY_DEVICES, ipDevices); renderIpDevices(); return cur; }
$("manualAdd").onclick = async () => {
  const ip = $("manualIp").value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { setMsg("addMsg", "주소는 192.168.0.23 같은 형식이에요.", "err"); return; }
  setMsg("addMsg", "확인 중..."); const s = await probe(ip, 3000);
  upsertIp({ ip, id: s && s.id, name: s && s.name, variant: s && s.variant });
  setMsg("addMsg", s ? `추가했어요 (${s.version}).` : "추가했어요. (지금은 기기에 닿지 않아요)", s ? "ok" : ""); $("manualIp").value = "";
};
async function guessLocalIp() {
  if (!window.RTCPeerConnection) return null;
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [] }); const done = (v) => { try { pc.close(); } catch (e) {} resolve(v); };
    const t = setTimeout(() => done(null), 2000);
    pc.onicecandidate = (e) => { const m = e.candidate && e.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/); if (m && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(m[1])) { clearTimeout(t); done(m[1]); } };
    pc.createDataChannel("x"); pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => done(null));
  });
}
const COMMON_BASES = ["192.168.0", "192.168.1", "192.168.200", "192.168.10", "192.168.100", "192.168.2", "192.168.3", "192.168.31", "192.168.50", "192.168.123", "192.168.8", "192.168.4", "10.0.0", "10.0.1", "172.16.0"];
$("scanBtn").onclick = async () => {
  if (scanning) { scanning = false; return; }
  scanning = true; $("scanLabel").textContent = "찾기 중지";
  const bases = []; const add = (b) => { if (b && !bases.includes(b)) bases.push(b); };
  const typed = $("manualIp").value.trim(); if (/^\d{1,3}(\.\d{1,3}){2}/.test(typed)) add(typed.split(".").slice(0, 3).join("."));
  const mine = await guessLocalIp(); if (mine) add(mine.replace(/\.\d+$/, ""));
  for (const d of ipDevices) if (d.ip) add(d.ip.replace(/\.\d+$/, ""));
  for (const b of COMMON_BASES) add(b);
  let found = 0;
  outer: for (const base of bases) {
    const ips = []; for (let i = 1; i <= 254; i++) ips.push(`${base}.${i}`);
    for (let i = 0; i < ips.length; i += 32) {
      if (!scanning) break outer;
      setMsg("addMsg", `${base}.x 확인 중... (${Math.round(i / 254 * 100)}%)${found ? ` · 찾음 ${found}` : ""}`);
      await Promise.all(ips.slice(i, i + 32).map(async (ip) => { const s = await probe(ip, 1500); if (s && s.version && s.host && s.host.startsWith("charttotem")) { upsertIp({ ip, id: s.id, name: s.name, variant: s.variant }); found++; } }));
    }
    if (found) break;
  }
  scanning = false; $("scanLabel").textContent = "같은 Wi-Fi에서 기기 찾기";
  setMsg("addMsg", found ? `${found}대를 찾았어요.` : "기기를 찾지 못했어요.", found ? "ok" : "err");
};
function setDevMode(on) { devMode = on; try { localStorage.setItem(KEY_DEV, on ? "1" : "0"); } catch (e) {} $("devSection").classList.toggle("hidden", !on); if (on) renderIpDevices(); }
$("devOff").onclick = () => { setDevMode(false); toast("개발자 모드를 껐어요"); };
let verTaps = 0, verTapAt = 0;
$("ver").onclick = () => { const now = Date.now(); verTaps = now - verTapAt < 1500 ? verTaps + 1 : 1; verTapAt = now; if (verTaps >= 7) { verTaps = 0; setDevMode(!devMode); toast(devMode ? "개발자 모드를 켰어요 (IP 직접 연결)" : "개발자 모드를 껐어요"); } };

// ------------------------------------------------------------
// 도움말: FAQ 목록. 질문을 누르면 그 답만 펼친다 (항목이 늘어나도 위에서 아래로 훑을 수 있게)
// ------------------------------------------------------------
const FAQ_ICON = ["wifi", "arrow-left-right", "wifi-off", "fingerprint", "monitor", "settings", "smartphone", "trash"];
const FAQ = [
  ["기기가 \"오프라인\" 으로 보여요", `<ol><li>기기 <b>전원</b>이 켜져 있고 화면에 시세나 시계가 움직이는지 보세요.</li>
<li>기기 화면에 <b>Wi-Fi 를 못 찾았어요</b> 와 QR 이 떠 있으면, 기기가 있는 곳의 Wi-Fi 에 아직 연결되지 않은 거예요. 폰 카메라로 그 QR 을 찍고 Wi-Fi 를 골라 비밀번호를 넣어 주세요.</li>
<li>공유기를 껐다 켠 직후라면 1~2분 기다려 보세요. 기기가 스스로 다시 붙어요.</li></ol>`],
  ["기기를 다른 곳으로 옮겼어요", `<p>새 장소에서 켜면 30초쯤 뒤 기기 화면에 QR 이 떠요. 그 QR 을 찍어 그곳 Wi-Fi 에 한 번만 연결하면 돼요.</p><p>이전 Wi-Fi 도 그대로 기억하니 돌아가면 알아서 붙고, 이 앱은 다시 연결할 필요가 없어요.</p>`],
  ["회사 Wi-Fi 에 안 붙어요", `<p>아이디·비밀번호 로그인 방식(기업용)이나 웹 로그인이 뜨는 Wi-Fi, 5GHz 전용 Wi-Fi 에는 기기가 붙을 수 없어요.</p><p>폰 핫스팟이나 소형 공유기를 쓰세요.</p>`],
  ["기기 ID 가 어디 있나요?", `<p>기기 화면 <b>오른쪽 위 구석</b>에 항상 작은 회색 글자로 적혀 있어요 (예: A75E1F). 기기를 켤 때 나오는 시작 화면 아래에도 나와요.</p><p>설정에서 숨길 수 있지만, 숨기면 새 폰을 연결할 때 기기를 껐다 켜서 시작 화면에서 확인해야 해요.</p>`],
  ["연결 코드가 기기 화면에 안 떠요", `<p>「기기 연결」에서 ID 를 넣고 다음을 누르면 기기가 최대 30초 안에 화면에 숫자 6자리를 띄워요. 기기가 꺼져 있거나 Wi-Fi 에 연결되지 않았으면 뜨지 않아요.</p><p>숫자는 10분 동안만 유효해요. 지나면 「처음부터」를 눌러 다시 받으세요.</p>`],
  ["설정을 바꿨는데 기기가 안 바뀌어요", `<p>설정은 바꾸는 즉시 기기로 가고 보통 1~2초 안에 반영돼요. 설정 화면 아래 "기기에 반영됐어요" 가 뜨면 끝이에요.</p><p>계속 "반영 중" 이거나 "(최대 30초)" 가 붙어 있으면 기기가 오프라인이거나 예전 펌웨어예요. 기기가 켜지면 바뀐 설정이 그때 반영돼요. 위의 오프라인 항목도 확인해 주세요.</p>`],
  ["다른 폰에서도 이 기기를 설정하고 싶어요", `<p>그 폰에서 이 앱을 열고 「기기 연결」로 같은 ID 와 기기 화면의 숫자 코드로 연결하면 돼요. 한 기기에 여러 폰을 연결할 수 있어요.</p>`],
  ["앱에서 기기를 빼고 싶어요", `<p>기기 항목 오른쪽 ⋯ 을 누르고 <b>기기 삭제</b>를 고르면 이 폰에서 연결이 끊겨요. 기기 자체 설정은 그대로예요.</p>`],
];
function renderFaq() {
  const box = $("faq"); box.innerHTML = "";
  FAQ.forEach(([q, a], i) => {
    const item = document.createElement("div"); item.className = "faq-item";
    const ic = FAQ_ICON[i] || "info";
    item.innerHTML = `<button class="faq-q" aria-expanded="false" aria-controls="faqa${i}"><span class="qic${ic === "trash" ? " danger" : ""}">${I(ic)}</span><span>${q}</span>${I("chevron-right")}</button><div class="faq-a doc hidden" id="faqa${i}">${a}</div>`;
    const btn = item.querySelector(".faq-q"), ans = item.querySelector(".faq-a");
    btn.onclick = () => { const open = ans.classList.toggle("hidden") === false; btn.setAttribute("aria-expanded", String(open)); item.classList.toggle("open", open); };
    box.appendChild(item);
  });
}
renderFaq();

// ------------------------------------------------------------
// 설치 안내
// ------------------------------------------------------------
let installPrompt = null;
const ua = navigator.userAgent, isIOS = /iPhone|iPad|iPod/.test(ua);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// Chrome 은 설치 조건(HTTPS·manifest·SW)을 갖춰도 사용자가 페이지와 한 번 상호작용한 뒤에야 beforeinstallprompt 를 준다.
// 그래서 카드엔 항상 「홈 화면에 추가」 버튼을 두고, 누르면 (1) 이미 받은 prompt 가 있으면 바로 설치 창, (2) 없으면 탭 직후 이벤트가 오길 잠깐 기다렸다가 설치 창,
// (3) 그래도 없으면(iOS·삼성 브라우저 등 네이티브 설치 창이 없는 환경) 수동 안내를 보여 준다.
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; $("installText").textContent = "다음에 기기를 바로 열 수 있어요."; });
window.addEventListener("appinstalled", () => { try { localStorage.setItem(KEY_INSTALL, "1"); } catch (e) {} $("installCard").classList.add("hidden"); toast("홈 화면에 추가했어요"); });
function manualGuide() {
  return isIOS ? "Safari 아래 공유 버튼(□↑) → 「홈 화면에 추가」를 누르세요."
    : /SamsungBrowser/.test(ua) ? "아래 메뉴(≡) → 「현재 페이지 추가」 → 「홈 화면」을 누르세요."
    : "오른쪽 위 메뉴(⋮) → 「홈 화면에 추가」(또는 「앱 설치」)를 누르세요.";
}
function showInstall() {
  if (standalone) return;
  let done = false; try { done = localStorage.getItem(KEY_INSTALL) === "1"; } catch (e) {}
  if (done) return;
  $("installCard").classList.remove("hidden");
  $("installBtn").classList.toggle("hidden", isIOS);   // iOS 는 네이티브 설치 창이 없다: 안내만
  $("installText").textContent = isIOS ? manualGuide() : "다음에 기기를 바로 열 수 있어요.";
}
async function doInstall() {
  if (!installPrompt) {   // 방금 탭했으니 이벤트가 곧 올 수 있다: 최대 1.5초 기다린다
    await new Promise((res) => { const t = setTimeout(res, 1500); window.addEventListener("beforeinstallprompt", () => { clearTimeout(t); res(); }, { once: true }); });
  }
  if (!installPrompt) { $("installText").textContent = "이 브라우저에선 직접 추가해 주세요: " + manualGuide(); return; }
  const p = installPrompt; installPrompt = null;
  p.prompt();
  const r = await p.userChoice;
  if (r.outcome === "accepted") { try { localStorage.setItem(KEY_INSTALL, "1"); } catch (e) {} $("installCard").classList.add("hidden"); }
  else installPrompt = null;
}
$("installBtn").onclick = doInstall;
$("installLater").onclick = () => $("installCard").classList.add("hidden");

// ------------------------------------------------------------
// 시작
// ------------------------------------------------------------
(function init() {
  $("ver").textContent = "v" + APP_VERSION;
  const p = new URLSearchParams(location.search);
  if (p.get("dev") === "1") setDevMode(true); else $("devSection").classList.toggle("hidden", !devMode);
  if (devMode) renderIpDevices();
  // 기기 QR / 온보딩 성공 화면에서 넘어옴: ?add=1&id=A75E1F(&ip=...). 이미 연결된 기기면 홈, 아니면 연결 화면으로 (ID 채워서)
  const qid = (p.get("id") || "").toUpperCase();
  if (p.get("add") || qid) {
    if (devMode && p.get("ip")) upsertIp({ ip: p.get("ip"), id: qid, host: p.get("host") || "" });
    history.replaceState(null, "", location.pathname);
    if (qid && !cloudDevices.find((d) => d.id === qid && !d.lost)) { location.hash = "#/add?id=" + qid; }
  }
  renderDevices();
  route();
  refreshAll();
  setInterval(refreshAll, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
  setTimeout(showInstall, 1500);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
