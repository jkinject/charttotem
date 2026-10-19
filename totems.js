// 기기 아이콘(토템 캐릭터) 12종 — 런처 홈(app.js)과 설정 페이지(cloud_shim.js, gen_launcher.py 가 settings-*.html 에 끼워 넣음)가 같이 쓴다.
// 기본값은 기기 ID 해시(같은 기기는 어느 폰에서 봐도 같은 아이콘), 홈 ⋯ 메뉴 「아이콘 바꾸기」로 고르면 cloudDevices[].totem 에 저장(이 폰에서만).
// 이미지: icons/totems/<file>.png 144px — 원본·프롬프트는 루트 저장소 branding/totems/ (python3 branding/totems/make_icons.py).
const TOTEMS = [["01-bull", "황소"], ["02-bear", "곰"], ["03-owl", "부엉이"], ["04-whale", "고래"], ["05-fox", "여우"], ["06-cat", "고양이"],
  ["07-rabbit", "토끼"], ["08-penguin", "펭귄"], ["09-frog", "개구리"], ["10-ghost", "유령"], ["11-robot", "로봇"], ["12-octopus", "문어"]];
function hashTotem(id) { let h = 5381; for (const c of String(id || "").toUpperCase()) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h % TOTEMS.length; }
function totemOf(d) { return Number.isInteger(d.totem) && d.totem >= 0 && d.totem < TOTEMS.length ? d.totem : hashTotem(d.id); }
function totemSrc(i) { return `icons/totems/${TOTEMS[i][0]}.png`; }

// 아이콘 고르기 바닥 시트 (CSS: launcher.css 의 .sheet-bd/.sheet/.totem-grid — 설정 페이지 style.css 에도 들어 있다).
// 누르면 d.totem 을 바꾸고 onPick(i) 를 부른다. 저장·화면 갱신은 호출자 몫. #sheet 가 없으면 만든다.
function openTotemPicker(d, name, onPick) {
  let sh = document.getElementById("sheet");
  if (!sh) { sh = document.createElement("div"); sh.id = "sheet"; sh.className = "sheet-bd"; document.body.appendChild(sh); }
  const cur = totemOf(d), h = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  sh.innerHTML = `<div class="sheet" role="dialog" aria-label="아이콘 바꾸기"><div class="sheet-title">${h(name)} 의 아이콘</div>
    <div class="totem-grid">${TOTEMS.map(([f, n], i) => `<button type="button" class="${i === cur ? "on" : ""}" data-i="${i}" aria-label="${n}" aria-pressed="${i === cur}"><img src="${totemSrc(i)}" alt=""><span>${n}</span></button>`).join("")}</div>
    <button type="button" class="cancel" data-a="cancel">닫기</button></div>`;
  const close = () => { sh.classList.remove("on"); setTimeout(() => { sh.innerHTML = ""; }, 200); };
  sh.onclick = (e) => {
    const b = e.target.closest("[data-i]");
    if (b) {
      const i = +b.dataset.i;
      d.totem = i;
      sh.querySelectorAll("[data-i]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      onPick(i);
      return;
    }
    if (e.target.closest("[data-a]") || e.target === sh) close();
  };
  requestAnimationFrame(() => sh.classList.add("on"));
}
