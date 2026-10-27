// 차트토템 관리자 페이지 (/admin/). Worker 의 /admin/* (cloud/API.md 1d) 를 비밀번호(Bearer)로 부른다.
// - 기기 목록 = Worker 가 KV(ENTITLE) 키로 아는 기기 전부 + 각 DO 의 요약. 온라인/오프라인/세팅 전/구버전/초기화됨 필터.
// - 기기 상세: 종목·화면·Wi-Fi·연결된 앱·활동 기록·원본 state, 명령(업데이트 확인/설치·재시작)·앱 권한.
// - Cloudflare 사용량: Worker 가 GraphQL 로 가져온 최근 14일 (CF_API_TOKEN 이 있을 때만).
const CLOUD = new URLSearchParams(location.search).get("cloud") || "https://charttotem-cloud.jkinject.workers.dev";
const KEY_PW = "ct.admin.pw";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const I = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
let toastTimer; function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 2600); }

let pw = null;
try { pw = localStorage.getItem(KEY_PW) || sessionStorage.getItem(KEY_PW); } catch (e) {}
let devices = [];          // 요약 목록
let latestFw = null;       // /fw/latest.json 의 version
let filter = "all", query = "";
const selected = new Set();
let timer = null;

// ---- API ----
async function api(path, { method = "GET", body, timeout = 20000 } = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try {
    const headers = { authorization: "Bearer " + pw };
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(CLOUD + path, { method, headers, body, cache: "no-store", signal: ac.signal });
    const j = await r.json().catch(() => ({ ok: false, error: "HTTP " + r.status }));
    j._status = r.status;
    return j;
  } catch (e) { return { ok: false, error: e.name === "AbortError" ? "timeout" : "network" }; }
  finally { clearTimeout(t); }
}

// ---- 시간 ----
const now = () => Math.floor(Date.now() / 1000);
function ago(ts) {
  if (!ts) return "-";
  const s = now() - ts;
  if (s < 0) return "방금";
  if (s < 60) return s + "초 전";
  if (s < 3600) return Math.floor(s / 60) + "분 전";
  if (s < 86400) return Math.floor(s / 3600) + "시간 전";
  return Math.floor(s / 86400) + "일 전";
}
const pad = (n) => String(n).padStart(2, "0");
function fmtTs(ts, withSec) {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` + (withSec ? ":" + pad(d.getSeconds()) : "");
}
function dur(sec) {
  if (sec == null) return "-";
  if (sec < 60) return sec + "초";
  if (sec < 3600) return Math.floor(sec / 60) + "분";
  if (sec < 86400) return Math.floor(sec / 3600) + "시간 " + Math.floor(sec % 3600 / 60) + "분";
  return Math.floor(sec / 86400) + "일 " + Math.floor(sec % 86400 / 3600) + "시간";
}
const num = (n) => (n == null ? "-" : Number(n).toLocaleString("ko-KR"));
const bytes = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : b >= 1e3 ? (b / 1e3).toFixed(0) + " KB" : b + " B");
const variantName = (v) => ({ kstock: "주식", coin: "코인" }[v] || v || "-");
const baseVer = (fw) => String(fw || "").replace(/-(kstock|coin)$/, "");
function cmpVer(a, b) { const x = baseVer(a).split(".").map(Number), y = baseVer(b).split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }
// 앱 연결 라벨: 런처는 navigator.userAgent 앞 60자를 보낸다 → 기기 종류로 줄여 보여 준다
function labelOf(t) {
  const l = t.label || "";
  if (!/Mozilla\//.test(l)) return l || "(이름 없음)";
  const m = /iPhone|iPad|Android|Macintosh|Windows|Linux/.exec(l);
  return { iPhone: "iPhone", iPad: "iPad", Android: "Android 폰", Macintosh: "Mac", Windows: "Windows PC", Linux: "Linux" }[m ? m[0] : ""] || "브라우저";
}
const isOld = (d) => !!(latestFw && d.registered && d.fw && cmpVer(d.fw, latestFw) < 0);

// ---- 로그인 ----
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = $("pw").value.trim();
  if (!v) return;
  $("loginBtn").disabled = true; $("loginMsg").textContent = "";
  pw = v;
  const r = await api("/admin/login");
  $("loginBtn").disabled = false;
  if (!r.ok) { pw = null; $("loginMsg").textContent = r._status === 401 ? "비밀번호가 맞지 않아요." : "서버에 연결하지 못했어요 (" + (r.error || "") + ")"; return; }
  try { ($("remember").checked ? localStorage : sessionStorage).setItem(KEY_PW, v); } catch (e2) {}
  enter();
});
$("logout").onclick = () => { try { localStorage.removeItem(KEY_PW); sessionStorage.removeItem(KEY_PW); } catch (e) {} pw = null; clearInterval(timer); $("app").classList.add("hidden"); $("gate").classList.remove("hidden"); $("pw").value = ""; };

async function enter() {
  $("gate").classList.add("hidden"); $("app").classList.remove("hidden");
  await loadAll();
  schedule();
}
function schedule() { clearInterval(timer); if ($("auto").checked) timer = setInterval(loadAll, 60000); }
$("auto").onchange = schedule;
$("refresh").onclick = loadAll;
$("usageRefresh").onclick = () => loadUsage(true);

// ---- 불러오기 ----
let loading = false;
async function loadAll() {
  if (loading) return; loading = true;
  $("refresh").disabled = true; $("topMsg").textContent = "";
  try {
    const [, devs] = await Promise.all([loadLatestFw(), loadDevices()]);
    if (devs) { devices = devs; renderChips(); renderTable(); renderActivity(); $("updated").textContent = "갱신 " + fmtTs(now(), true); }
    loadUsage(false);
  } finally { loading = false; $("refresh").disabled = false; }
}
async function loadLatestFw() {
  try { const r = await fetch(CLOUD + "/fw/latest.json", { cache: "no-store" }); const j = await r.json(); if (j && j.version) latestFw = j.version; } catch (e) {}
}
async function loadDevices() {
  const out = []; let cursor = null;
  for (let i = 0; i < 20; i++) {   // 40대씩, 최대 800대
    const r = await api("/admin/devices" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""));
    if (!r.ok) {
      if (r._status === 401) { toast("비밀번호가 바뀌었어요. 다시 로그인하세요."); $("logout").click(); return null; }
      $("topMsg").textContent = "기기 목록을 못 가져왔어요: " + (r.error || "") + (r.detail ? " · " + r.detail : "");
      return null;
    }
    out.push(...r.devices);
    cursor = r.cursor;
    if (!cursor) break;
  }
  // 마지막 연결이 최근인 순서, 초기화된 기기는 뒤로
  out.sort((a, b) => (b.registered - a.registered) || ((b.lastSync || 0) - (a.lastSync || 0)) || a.id.localeCompare(b.id));
  return out;
}

// ---- 요약 칩 ----
function counts() {
  const c = { all: devices.length, online: 0, offline: 0, unset: 0, old: 0, gone: 0, ws: 0, kstock: 0, coin: 0, apps: 0 };
  for (const d of devices) {
    if (!d.registered) { c.gone++; continue; }
    if (d.online) c.online++; else c.offline++;
    if (d.st && d.st.setupDone === false) c.unset++;
    if (isOld(d)) c.old++;
    if (d.ws) c.ws++;
    if (d.variant === "kstock") c.kstock++; else if (d.variant === "coin") c.coin++;
    c.apps += (d.tokens || []).length;
  }
  return c;
}
function renderChips() {
  const c = counts();
  const chips = [
    ["all", c.all, "전체 기기", ""], ["online", c.online, "온라인", "good"], ["offline", c.offline, "오프라인", c.offline ? "bad" : ""],
    ["unset", c.unset, "세팅 전 (앱 미연결)", c.unset ? "warn" : ""], ["old", c.old, "구버전 펌웨어" + (latestFw ? " (최신 " + latestFw + ")" : ""), c.old ? "warn" : ""],
    ["gone", c.gone, "초기화됨 (기록만)", ""],
    [null, c.ws, "포크 채널 연결", ""], [null, c.kstock + " / " + c.coin, "주식 / 코인", ""], [null, c.apps, "연결된 앱(토큰)", ""],
  ];
  $("chips").innerHTML = chips.map(([f, n, label, cls]) => `<div class="chip ${cls}${f && f === filter ? " on" : ""}"${f ? ` data-f="${f}"` : ' style="cursor:default"'}><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join("");
}
$("chips").addEventListener("click", (e) => { const c = e.target.closest("[data-f]"); if (c) setFilter(c.dataset.f); });

// ---- 기기 표 ----
function setFilter(f) { filter = f; document.querySelectorAll("#filterSeg button").forEach((b) => b.classList.toggle("on", b.dataset.f === f)); renderChips(); renderTable(); }
$("filterSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) setFilter(b.dataset.f); });
$("q").addEventListener("input", () => { query = $("q").value.trim().toLowerCase(); renderTable(); });

function matches(d) {
  if (filter === "online" && !(d.registered && d.online)) return false;
  if (filter === "offline" && !(d.registered && !d.online)) return false;
  if (filter === "unset" && !(d.registered && d.st && d.st.setupDone === false)) return false;
  if (filter === "old" && !isOld(d)) return false;
  if (filter === "gone" && d.registered) return false;
  if (query) {
    const hay = [d.id, d.name, d.fw, d.variant, d.st && d.st.ssid, d.st && d.st.ip, d.st && d.st.layoutName, ...(d.codes || []), ...(d.slots || []).map((s) => s.name)].join(" ").toLowerCase();
    if (!hay.includes(query)) return false;
  }
  return true;
}
function statusOf(d) {
  if (!d.registered) return ["gone", "초기화됨"];
  if (d.online) return ["on", d.ws ? "온라인" : "온라인·폴링"];
  if (d.pairing) return ["wait", "연결 코드"];
  return ["off", "오프라인"];
}
function renderTable() {
  const rows = devices.filter(matches);
  $("devCount").textContent = `${rows.length}대 표시 · 전체 ${devices.length}대`;
  $("devEmpty").textContent = rows.length ? "" : (devices.length ? "조건에 맞는 기기가 없어요." : "아직 서버에 접속한 기기가 없어요.");
  $("devBody").innerHTML = rows.map((d) => {
    const [cls, label] = statusOf(d);
    const st = d.st || {};
    const codes = (d.slots && d.slots.length ? d.slots : (d.codes || []).map((c) => ({ code: c }))).slice(0, 6);
    const more = (d.codes || []).length - codes.length;
    const apps = d.apps ? d.apps.map((a) => `<span class="tag${a === d.variant ? " ac" : ""}">${esc(variantName(a))}</span>`).join("") : "";
    const fwTag = isOld(d) ? `<span class="tag warn">구버전</span>` : "";
    const fwAvail = st.fw && st.fw.available ? `<span class="tag warn">NEW ${esc(st.fw.latest)}</span>` : "";
    return `<tr data-id="${d.id}" class="${selected.has(d.id) ? "sel" : ""}">
      <td class="c"><input type="checkbox" data-sel="${d.id}" ${selected.has(d.id) ? "checked" : ""} ${d.registered ? "" : "disabled"}></td>
      <td><span class="st ${cls}">${label}</span>${st.setupDone === false && d.registered ? '<br><span class="tag warn">세팅 전</span>' : ""}${d.pending && d.pending.length ? `<br><span class="tag">대기 명령 ${d.pending.length}</span>` : ""}</td>
      <td><span class="devid">${esc(d.id)}</span><br><span class="devname">${esc(d.name || "(이름 없음)")}</span></td>
      <td><b>${esc(variantName(d.variant))}</b><br>${apps}</td>
      <td class="mono">${esc(baseVer(d.fw) || "-")}<br>${fwTag}${fwAvail}</td>
      <td>${esc(st.layoutName || st.layout || "-")}<br><span class="devname">${esc(st.theme === "clock" ? "시계" : st.theme === "stock" ? "" : (st.theme || ""))}${st.night && st.night.active ? '<span class="tag">야간</span>' : ""}</span></td>
      <td class="codes">${codes.map((s) => `<span class="tag" title="${esc(s.name || "")}">${esc(s.name || s.code)}</span>`).join("")}${more > 0 ? `<span class="more">+${more}</span>` : ""}${!codes.length ? '<span class="dim">-</span>' : ""}</td>
      <td>${esc(st.ssid || "-")}<br><span class="devname">${esc(st.ip || "")}</span></td>
      <td class="when"><b>${d.registered ? esc(ago(d.lastSync)) : "-"}</b><span>${esc(fmtTs(d.lastSync))}</span></td>
      <td class="when"><b>${esc(d.registeredAt ? fmtTs(d.registeredAt).slice(0, 10) : "-")}</b><span>${d.registeredAt ? esc(ago(d.registeredAt)) : ""}</span></td>
      <td>${(d.tokens || []).length ? `${d.tokens.length}개<br><span class="devname">${esc(labelOf(d.tokens[0]) + (d.tokens.length > 1 ? " 외" : ""))} · ${esc(ago(d.tokens[0].lastUsed))}</span>` : '<span class="dim">없음</span>'}</td>
    </tr>`;
  }).join("");
  renderBulk();
}
$("devBody").addEventListener("click", (e) => {
  const cb = e.target.closest("[data-sel]");
  if (cb) { cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel); cb.closest("tr").classList.toggle("sel", cb.checked); renderBulk(); return; }
  if (e.target.closest("td.c")) return;   // 체크박스 칸의 여백은 행을 열지 않는다
  const tr = e.target.closest("tr[data-id]");
  if (tr) openDetail(tr.dataset.id);
});
$("selAll").onchange = () => { const rows = devices.filter(matches).filter((d) => d.registered); rows.forEach((d) => ($("selAll").checked ? selected.add(d.id) : selected.delete(d.id))); renderTable(); };
$("selClear").onclick = () => { selected.clear(); $("selAll").checked = false; renderTable(); };
function renderBulk() { $("bulk").classList.toggle("hidden", selected.size === 0); $("selCount").textContent = selected.size; }
$("bulk").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-bulk]"); if (!b) return;
  const q = b.dataset.bulk, ids = [...selected];
  if (!confirm(`${ids.length}대에 「${b.textContent}」 명령을 보낼까요?\n${q === "update=1" ? "최신 펌웨어가 있는 기기만 설치하고 다시 시작해요 (1~2분)." : q === "restart=1" ? "기기가 다시 시작해요." : "기기가 새 펌웨어가 있는지 확인해요."}`)) return;
  let okN = 0;
  for (const id of ids) { const r = await api(`/admin/${id}/settings?${q}`, { method: "POST" }); if (r.ok) okN++; }
  toast(`${okN}/${ids.length}대에 보냈어요`);
  selected.clear(); setTimeout(loadAll, 1500);
});

// ---- 최근 활동 ----
const EV = { register: "등록", reregister: "재등록", first: "첫 동기화", fw: "펌웨어", back: "다시 연결", cmd: "명령", pair: "연결 코드", paired: "앱 연결", pairfail: "연결 실패", unpair: "앱 해제", apps: "앱 권한" };
function evText(l) {
  if (l.ev === "back") return "오프라인이었다가 다시 연결 (" + dur(Number(l.d)) + " 만에)";
  if (l.ev === "pair") return "앱이 연결 코드를 요청";
  if (l.ev === "pairfail") return "연결 코드 5회 틀림";
  if (l.ev === "cmd") return cmdText(l.d);
  return l.d || "";
}
const CMD = { add: "종목 추가", remove: "종목 삭제", codes: "종목 목록", rotate: "전환 간격", layout: "화면", theme: "테마", name: "이름", bl: "밝기", night: "야간 모드", restart: "재시작", update: "펌웨어 설치", fwcheck: "업데이트 확인", reset: "기기 초기화", app: "앱 전환", wssid: "Wi-Fi 등록", wforget: "Wi-Fi 삭제", wconnect: "Wi-Fi 전환", wscan: "Wi-Fi 검색", setup: "세팅 표시", tz: "시간대", colors: "색", base: "기준", code: "코드" };
function cmdText(q) {
  const admin = q.startsWith("[관리자] ");
  const parts = (admin ? q.slice(6) : q).split("&").filter(Boolean).map((p) => { const i = p.indexOf("="); const k = i < 0 ? p : p.slice(0, i); let v = i < 0 ? "" : p.slice(i + 1); try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) {} return (CMD[k] || k) + (v && v !== "1" ? " " + v : ""); });
  return (admin ? "[관리자] " : "앱에서 ") + parts.join(", ");
}
function renderActivity() {
  const all = [];
  for (const d of devices) for (const l of d.log || []) all.push({ ...l, id: d.id, name: d.name });
  all.sort((a, b) => b.at - a.at);
  $("activity").innerHTML = all.slice(0, 120).map((l) => `<li><span class="t">${esc(fmtTs(l.at, true))}</span><span><span class="who" data-open="${l.id}">${esc(l.id)}</span>${l.name ? ` <span class="dim">${esc(l.name)}</span>` : ""}</span><span class="d"><span class="ev ${esc(l.ev)}">${esc(EV[l.ev] || l.ev)}</span> ${esc(evText(l))}</span></li>`).join("") || '<li class="dim">아직 기록이 없어요.</li>';
}
$("activity").addEventListener("click", (e) => { const w = e.target.closest("[data-open]"); if (w) openDetail(w.dataset.open); });

// ---- 상세 드로어 ----
let detailId = null;
$("drawerBd").addEventListener("click", (e) => { if (e.target === $("drawerBd") || e.target.closest(".close")) closeDetail(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
function closeDetail() { detailId = null; $("drawerBd").classList.remove("on"); }
async function openDetail(id) {
  detailId = id;
  $("drawerBd").classList.add("on");
  $("drawer").innerHTML = `<div class="dhead"><h2>${esc(id)}</h2><span class="dim">불러오는 중…</span><button class="close" aria-label="닫기">${I("x")}</button></div>`;
  const [s, raw] = await Promise.all([api(`/admin/${id}/summary`), api(`/admin/${id}/state`)]);
  if (detailId !== id) return;
  if (!s.ok) { $("drawer").innerHTML = `<div class="dhead"><h2>${esc(id)}</h2><button class="close" aria-label="닫기">${I("x")}</button></div><div class="pad msg err">${esc(s.error || "오류")}</div>`; return; }
  renderDetail(s, raw && raw.ok !== false ? raw : null);
}
function renderDetail(d, raw) {
  const st = d.st || {}, [cls, label] = statusOf(d);
  const night = st.night ? (st.night.on ? `켜짐 ${pad(Math.floor(st.night.from / 60))}:${pad(st.night.from % 60)}~${pad(Math.floor(st.night.to / 60))}:${pad(st.night.to % 60)} · ${["끄기", "어둡게", "그대로"][st.night.mode] || st.night.mode}${st.night.active ? " · 지금 야간" : ""}` : "꺼짐") : "-";
  const fwi = st.fw || {};
  $("drawer").innerHTML = `
    <div class="dhead"><h2>${esc(d.id)}</h2><span class="st ${cls}">${label}</span><span class="dim">${esc(d.name || "")}</span><button class="close" aria-label="닫기">${I("x")}</button></div>
    ${d.registered ? `<div class="actions">
      <button class="btn small" data-cmd="fwcheck=1">${I("refresh")}업데이트 확인</button>
      <button class="btn small" data-cmd="update=1" ${fwi.available ? "" : 'title="기기가 아는 최신 버전이 없어요. 먼저 확인을 누르세요"'}>${I("upload")}펌웨어 설치${fwi.available ? " (" + esc(fwi.latest) + ")" : ""}</button>
      <button class="btn small" data-cmd="restart=1">${I("power")}재시작</button>
      <a class="btn small ghost" href="../settings-${esc(d.variant || "kstock")}.html?id=${esc(d.id)}" target="_blank">${I("external-link")}설정 페이지</a>
    </div>` : `<div class="actions"><span class="dim" style="font-size:13px">초기화돼 서버 기록이 비어 있어요. 기기를 다시 켜 Wi-Fi 에 붙이면 새로 등록돼요.</span><button class="btn small danger" id="forget">${I("trash")}목록에서 지우기</button></div>`}
    <div class="dsec"><h3>연결</h3><dl class="kv">
      <dt>마지막 연결</dt><dd>${esc(fmtTs(d.lastSync, true))} <span class="dim">(${esc(ago(d.lastSync))})</span></dd>
      <dt>등록</dt><dd>${esc(fmtTs(d.registeredAt, true))}</dd>
      <dt>채널</dt><dd>${d.ws ? "포크 채널 붙음 (" + esc(d.wsLive) + ")" : "HTTP 폴링"} · 주기 ${esc(d.pollSec || "-")}초</dd>
      <dt>펌웨어</dt><dd>${esc(d.fw || "-")}${fwi.latest ? ` <span class="dim">· 기기가 본 최신 ${esc(fwi.latest)}${fwi.available ? " (설치 가능)" : ""}${fwi.checked != null ? ", " + esc(dur(fwi.checked)) + " 전 확인" : ""}</span>` : ""}${isOld(d) ? ` <span class="tag warn">서버 최신 ${esc(latestFw)}</span>` : ""}</dd>
      <dt>앱 권한</dt><dd><div class="appsel">${["kstock", "coin"].map((a) => `<label class="chk"><input type="checkbox" data-app="${a}" ${(d.apps || []).includes(a) ? "checked" : ""} ${d.registered ? "" : "disabled"}> ${variantName(a)}</label>`).join("")}<span class="dim">지금 ${esc(variantName(d.variant))}</span></div></dd>
      <dt>대기 명령</dt><dd>${d.pending && d.pending.length ? d.pending.map((c) => `<div class="mono" style="font-size:12px">#${c.seq} ${esc(c.q)} <span class="dim">${esc(ago(c.at))}</span></div>`).join("") : '<span class="dim">없음</span>'}</dd>
      <dt>연결 코드</dt><dd>${d.pairing ? (d.pairing === "shown" ? "기기 화면에 표시 중" : "기기가 받기 전") : '<span class="dim">진행 중 아님</span>'}</dd>
    </dl></div>
    <div class="dsec"><h3>기기 상태</h3><dl class="kv">
      <dt>세팅</dt><dd>${st.setupDone === false ? '<span class="tag warn">세팅 전 (앱 연결 QR 화면)</span>' : st.setupDone === true ? "완료" : "-"}</dd>
      <dt>화면</dt><dd>${esc(st.layoutName || "-")} <span class="dim">${esc(st.layout || "")}${st.theme ? " · " + esc(st.theme) : ""}</span></dd>
      <dt>보는 종목</dt><dd>${esc(st.symbol || "-")} <span class="dim">· ${esc(st.rotate || "-")}초마다 전환</span></dd>
      <dt>Wi-Fi</dt><dd>${esc(st.ssid || "-")} <span class="dim">${esc(st.ip || "")}</span>${Array.isArray(st.wifiKnown) && st.wifiKnown.length ? `<br><span class="dim">저장됨: ${esc(st.wifiKnown.join(", "))}</span>` : ""}</dd>
      <dt>밝기 · 야간</dt><dd>${esc(st.brightness != null ? st.brightness + "%" : "-")} · ${esc(night)}</dd>
      <dt>가동 · 메모리</dt><dd>${esc(dur(st.uptime))} · 힙 ${esc(num(st.heap))}B <span class="dim">(최소 ${esc(num(st.heapMin))})</span></dd>
      <dt>시각 · 글꼴</dt><dd>${st.timeSynced ? "맞춤" : "아직"} · ${esc(st.font || "-")} · ${esc(st.tz || "")}</dd>
      ${st.error ? `<dt>오류</dt><dd class="msg err" style="display:block">${esc(st.error)}</dd>` : ""}
    </dl></div>
    <div class="dsec"><h3>종목 ${d.codes ? d.codes.length : 0}개</h3>${(d.slots || []).length ? `<table class="slots">${d.slots.map((s) => `<tr><td>${esc(s.code)}</td><td>${esc(s.name || "")}</td><td class="r">${esc(s.price != null ? num(s.price) : "")}</td><td class="r ${s.change > 0 ? "up" : s.change < 0 ? "down" : ""}">${s.change != null ? (s.change > 0 ? "+" : "") + esc(s.change) + "%" : ""}</td><td class="r">${s.ok === false ? `<span class="tag bad">${esc(s.error || "오류")}</span>` : ""}</td></tr>`).join("")}</table>` : `<span class="dim">${(d.codes || []).join(", ") || "없음"}</span>`}</div>
    <div class="dsec"><h3>연결된 앱 ${(d.tokens || []).length}개</h3>${(d.tokens || []).length ? `<dl class="kv">${d.tokens.map((t) => `<dt title="${esc(t.label)}">${esc(labelOf(t))}</dt><dd>마지막 사용 ${esc(ago(t.lastUsed))} <span class="dim">· 연결 ${esc(fmtTs(t.createdAt))}</span></dd>`).join("")}</dl>` : '<span class="dim">없음 — 앱이 아직 연결되지 않았어요.</span>'}</div>
    <div class="dsec"><h3>활동 기록</h3><ul class="dlog">${(d.log || []).slice().reverse().map((l) => `<li><span class="t">${esc(fmtTs(l.at, true))}</span><span><span class="ev ${esc(l.ev)}">${esc(EV[l.ev] || l.ev)}</span> ${esc(evText(l))}</span></li>`).join("") || '<li class="dim">없음</li>'}</ul></div>
    <div class="dsec"><details><summary>원본 state JSON</summary><pre class="raw">${esc(raw ? JSON.stringify(raw, null, 1) : "없음")}</pre></details></div>`;
  $("drawer").querySelectorAll("[data-cmd]").forEach((b) => { b.onclick = async () => {
    const q = b.dataset.cmd;
    if (q !== "fwcheck=1" && !confirm(`${d.id} 에 「${b.textContent.trim()}」 명령을 보낼까요?`)) return;
    b.disabled = true;
    const r = await api(`/admin/${d.id}/settings?${q}`, { method: "POST" });
    toast(r.ok ? "보냈어요. 기기가 곧 받아요." : "실패: " + (r.error || ""));
    setTimeout(() => openDetail(d.id), 1500);
  }; });
  $("drawer").querySelectorAll("[data-app]").forEach((cb) => { cb.onchange = async () => {
    const apps = [...$("drawer").querySelectorAll("[data-app]")].filter((x) => x.checked).map((x) => x.dataset.app);
    if (!apps.length) { cb.checked = true; toast("앱은 하나 이상 있어야 해요"); return; }
    const r = await api(`/admin/${d.id}/apps`, { method: "PUT", body: JSON.stringify({ apps, by: "admin" }) });
    toast(r.ok ? "앱 권한: " + apps.map(variantName).join(", ") : "실패: " + (r.error || ""));
    setTimeout(() => openDetail(d.id), 800);
  }; });
  const fg = $("forget");
  if (fg) fg.onclick = async () => {
    if (!confirm(`${d.id} 를 목록에서 지울까요? 기기가 다시 접속하면 새로 나타나요.`)) return;
    const r = await api(`/admin/${d.id}`, { method: "DELETE" });
    toast(r.ok ? "지웠어요" : "실패: " + (r.error || ""));
    closeDetail(); loadAll();
  };
}

// ---- Cloudflare 사용량 ----
async function loadUsage(fresh) {
  const r = await api("/admin/usage" + (fresh ? "?fresh=1" : ""));
  const box = $("usage");
  if (!r.ok) {
    if (r.error === "no token") {
      box.innerHTML = `<div class="notoken"><b>Cloudflare 지표를 가져오려면 API 토큰이 필요해요.</b><br>
        Cloudflare 대시보드 → 내 프로필 → <b>API 토큰</b> → 토큰 만들기 → 사용자 지정 → 권한 <code>Account · Account Analytics · Read</code> 만 주고 만든 뒤,
        터미널에서 <code>cd cloud && npx wrangler secret put CF_API_TOKEN</code> 으로 붙여 넣으세요. 토큰은 Worker 안에만 있고 이 페이지로는 오지 않아요.</div>`;
    } else box.innerHTML = `<div class="msg err" style="display:block;padding:8px 0">사용량을 못 가져왔어요: ${esc(r.error || "")} ${esc(r.detail || "")}</div>`;
    return;
  }
  const L = r.limits, today = r.days.find((x) => x.date === r.today) || { kv: {} };
  const kv = today.kv || {};
  const meter = (label, used, limit, fmt) => { const p = limit ? used / limit : 0; return `<div class="meter ${p > 0.9 ? "bad" : p > 0.6 ? "warn" : ""}"><div class="lbl"><span>${esc(label)}</span><b>${esc(fmt ? fmt(used) : num(used))} / ${esc(fmt ? fmt(limit) : num(limit))}</b></div><div class="track"><div class="fill" style="width:${Math.min(100, p * 100).toFixed(1)}%"></div></div></div>`; };
  const maxH = Math.max(1, ...r.hours.map((h) => h.requests));
  const curHour = new Date().toISOString().slice(0, 13);
  box.innerHTML = `
    <div class="meters">
      ${meter("Worker 요청 (오늘)", today.requests || 0, L.requests)}
      ${meter("Durable Object 요청", today.doRequests || 0, L.doRequests)}
      ${meter("DO 활성 시간 GB-s", today.doGbs || 0, L.doGbs)}
      ${meter("KV 읽기", kv.read || 0, L.kvRead)}
      ${meter("KV 쓰기", kv.write || 0, L.kvWrite)}
      ${meter("KV 목록 조회", kv.list || 0, L.kvList)}
      ${today.rowsWritten ? meter("DO 행 쓰기", today.rowsWritten, L.rowsWritten) : ""}
      ${meter("DO 저장 용량", r.storedBytes || 0, L.storageBytes, bytes)}
    </div>
    <div class="dim" style="font-size:12px">오늘 시간대별 Worker 요청 (UTC)</div>
    <div class="hours">${r.hours.map((h) => `<i style="height:${Math.max(4, h.requests / maxH * 100).toFixed(0)}%" class="${h.hour.slice(0, 13) === curHour ? "now" : ""}" data-t="${esc(h.hour.slice(11, 16))} · ${esc(num(h.requests))}건${h.errors ? " · 오류 " + h.errors : ""}"></i>`).join("")}</div>
    <table class="days"><thead><tr><th>날짜 (UTC)</th><th>요청</th><th>오류</th><th>CPU p50</th><th>DO 요청</th><th>DO 오류</th><th>DO GB-s</th><th>KV 읽기</th><th>KV 쓰기</th></tr></thead>
    <tbody>${r.days.slice().reverse().map((x) => `<tr class="${x.date === r.today ? "today" : ""}"><td>${esc(x.date)}</td><td>${num(x.requests)}</td><td>${num(x.errors)}</td><td>${x.cpuP50 ? (x.cpuP50 / 1000).toFixed(1) + "ms" : "-"}</td><td>${num(x.doRequests)}</td><td>${num(x.doErrors)}</td><td>${esc(x.doGbs)}</td><td>${num(x.kv.read || 0)}</td><td>${num(x.kv.write || 0)}</td></tr>`).join("")}</tbody></table>
    <div class="dim" style="font-size:12px;margin-top:8px">무료 한도: 요청 10만/일 · DO 요청 10만/일 · DO 활성 13,000 GB-s/일 · KV 읽기 10만/일, 쓰기·삭제·목록 1,000/일 · DO 저장 5GB. 5분 캐시 (갱신 ${esc(fmtTs(r.ts, true))}).</div>`;
}

// ---- 시작 ----
if (pw) { api("/admin/login").then((r) => { if (r.ok) enter(); else { pw = null; $("gate").classList.remove("hidden"); } }); }
