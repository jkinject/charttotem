// 관리자 페이지: 의견 건의 목록 (Worker GET /admin/feedback, cloud/API.md 1g). 런처 「의견 건의하기」로 들어온 글을 최신순으로 모아 본다.
// admin.js 의 api·esc·fmtTs·ago·openDetail 을 쓴다. 본문이 보일 때·새로고침·5분 자동 새로고침에 맞춰 불러온다 (요청은 한 번에 DO 1건)
let fbCursor = null, fbLoading = false;

function fbRow(x) {
  const info = [x.platform, x.appVersion ? "앱 v" + x.appVersion : ""].filter(Boolean).join(" · ");
  const ids = (x.devices || []).map((id) => `<button class="who" data-id="${esc(id)}">${esc(id)}</button>`).join(" ");
  return `<li><div class="fbmeta"><span>${esc(fmtTs(x.at))} (${esc(ago(x.at))})</span>${info ? `<span>${esc(info)}</span>` : ""}${ids ? `<span>${ids}</span>` : ""}</div><div class="fbtext">${esc(x.text)}</div></li>`;
}
async function loadFeedback(more) {
  if (fbLoading) return;
  fbLoading = true;
  const r = await api("/admin/feedback?limit=50" + (more && fbCursor ? "&cursor=" + encodeURIComponent(fbCursor) : ""));
  fbLoading = false;
  if ($("app").classList.contains("hidden")) return;   // 그 사이 로그아웃
  const empty = $("fbEmpty");
  if (!r.ok) {
    if (!more) { $("fbList").innerHTML = ""; $("fbCount").textContent = ""; }
    empty.textContent = "의견을 불러오지 못했어요: " + (r.error || ""); empty.classList.remove("hidden");
    return;
  }
  fbCursor = r.cursor;
  const html = r.items.map(fbRow).join("");
  if (more) $("fbList").insertAdjacentHTML("beforeend", html); else $("fbList").innerHTML = html;
  $("fbCount").textContent = "총 " + num(r.total) + "건";
  empty.textContent = r.total ? "" : "아직 들어온 의견이 없어요.";
  empty.classList.toggle("hidden", !!r.total);
  $("fbMoreWrap").classList.toggle("hidden", !r.cursor);
}
$("fbMore").onclick = () => loadFeedback(true);
$("fbList").onclick = (e) => { const b = e.target.closest(".who"); if (b) openDetail(b.dataset.id); };
$("refresh").addEventListener("click", () => loadFeedback(false));
new MutationObserver(() => {
  if ($("app").classList.contains("hidden")) { fbCursor = null; $("fbList").innerHTML = ""; $("fbCount").textContent = ""; }   // 로그아웃: 글을 화면에 남기지 않는다
  else loadFeedback(false);
}).observe($("app"), { attributes: true, attributeFilter: ["class"] });
setInterval(() => { if ($("auto").checked && !document.hidden && !$("app").classList.contains("hidden")) loadFeedback(false); }, 300000);
