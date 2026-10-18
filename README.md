# 차트토템 런처 (PWA)

책상에 세워두는 투자자의 작은 토템, **차트토템** 기기를 폰에서 관리하는 설치형 웹앱.
GitHub Pages 로 호스팅: https://jkinject.github.io/charttotem/

- 기기 목록(여러 대), 온보딩/기기 QR 로 자동 등록 (`?add=1&id=&ip=&host=&ssid=`)
- **기기 관리 전용 (0.5.x)**: 기기 항목에는 연결 상태 점 · 이름 · Wi-Fi/주소 · ⋯(이름 바꾸기/삭제) · 요약 한 줄(펌웨어 · 레이아웃 · 종목 수 · 표시 중 종목) · 「기기 설정 열기」만 있다.
  「기기 설정 열기」는 `/api/state` 가 닿을 때만 활성이다(연결 확인 전·실패 시 회색, 탭 불가). 기기와 통신할 수 없는 브라우저(「열기만」 모드)에서는 항상 활성.
  종목 추가/삭제, 화면 레이아웃, 색, 시간대 등 모든 설정은 기기 설정 페이지(http://<기기IP>/)에서 한다. (0.2~0.4 에 있던 런처 안 종목 목록·검색·화면 패널은 뺐다)
- 연결 상태 확인은 Chrome(안드로이드) 의 Local Network Access 로 HTTPS 페이지에서 기기(HTTP) 와 통신. 안 되는 브라우저는 「열기만」 모드.
- 같은 Wi-Fi 대역 스캔으로 기기 찾기, 주소 직접 입력
- 오프라인에서도 열리는 문제 해결 가이드, 홈 화면 설치 안내
- **디자인 (0.4.0)**: 펌웨어 설정 페이지와 같은 디자인 시스템(`firmware/docs/settings-redesign/design-system.md`) — 카드 없는 플랫 리스트, 왼쪽 정렬 헤더, 행 + 머리카락 선 + 8px 띠, Lucide 24px 라인 아이콘(`index.html` 인라인 스프라이트 = `firmware/tools/web/icons.svg`, `app.js` 의 `I("name")`).
  `style.css` 앞부분은 펌웨어 `tools/web/settings.css` 와 동일하고 끝의 "런처 전용" 블록만 다르다. 펌웨어 쪽 CSS 를 바꾸면 여기도 맞춘다.
- 기기 항목 = 프로필(이름·Wi-Fi·주소·⋯ 메뉴) → 현재 종목 가격 → 종목 목록 → 화면 전환 → 검색/추가 → 「화면 · 레이아웃」 패널 → 「기기 설정 열기」. 배포 후 설치된 앱은 `sw.js` 의 `CACHE` 이름이 바뀌어야 새 파일을 받는다.
- 빌드 없음. 정적 파일 그대로 배포 (`index.html`, `app.js`, `sw.js`, `style.css`, `manifest.json`, `icons/`)

펌웨어 쪽 연동: 기기의 `src/brand.h` `LAUNCHER_URL` 이 이 주소. 도메인을 바꾸면 거기도 바꿔서 OTA.
`sw.js` 의 `CACHE` 이름을 올리면 설치된 앱이 새 파일을 받는다.


## 0.6.0 — 클라우드 페어링 (고객용 기본 경로)

- 고객은 기기 IP 를 모른다. **기기 연결** 에서 기기 화면의 Device ID 6자리를 넣으면 서버가 기기 화면에 6자리 숫자 코드를 띄우고, 그 숫자를 입력하면 토큰을 받아 어디서든(집 밖에서도) 기기를 설정한다. 중계 서버는 `cloud/`(Cloudflare Worker + Durable Object, `cloud/API.md`).
- 기기 설정 화면은 `settings-kstock.html` / `settings-coin.html`(`?id=<기기ID>`)로, 펌웨어 설정 페이지와 같은 소스(`firmware/tools/web/`)에서 `firmware/tools/gen_launcher.py` 가 만든다. `cloud_shim.js` 가 `/api/*` 를 Worker 로 돌린다. **직접 고치지 말고 소스를 고친 뒤 생성기를 돌린다** (`style.css` 도 `settings.css + launcher.css` 에서 생성).
- Wi-Fi 비밀번호는 클라우드로 보내지 않는다. Wi-Fi 변경·추가·초기화, OTA, 코인 로고 업로드는 기기 옆(IP 접속)에서만 보인다 (`.local-only`).
- IP 직접 연결(LNA 스캔, `http://<ip>/`)은 **개발자 모드** 에서만: 버전 글자를 7번 탭하거나 `?dev=1`.
- 기기 QR(`?add=1&id=`)은 기기 연결 화면으로 바로 이어진다 (ID 자동 입력).

## 0.7.0 — 저장 버튼 · 도움말 카드

- 설정 페이지는 토글마다 바로 보내지 않고 **하단 「저장」** 을 눌러야 기기에 반영된다(초안 + 저장 바). 기기는 30초마다 클라우드를 확인하므로 저장 뒤 최대 30초. 저장 바에 "기기에 반영 중… → 반영됐어요" 가 표시된다.
- 홈의 긴 도움말을 FAQ 목록(질문을 누르면 답이 펼쳐짐, `app.js` 의 `FAQ` 배열에 추가)으로 바꿨다 (0.7.1).

## 0.7.2 — 시계 옵션

- 화면 설정 「표시 항목」에 **초 표시**, **12시간제(AM/PM)** 토글 (시계 테마, FIVE DOTS 제외). 미리보기에도 반영. 펌웨어 2.5.0 이상 필요.

## 0.7.6 — 미리보기를 기기 글꼴로

- 설정 페이지의 화면 미리보기가 기기와 같은 비트맵 폰트로 그려진다: `fonts/tft.json`(TFT_eSPI Font1/2/4/7 + FreeSansBold 12/18/24, `firmware/tools/gen_webfonts.py` 생성)과 `fonts/ko24.bin` · `ko14.bin`(기기 LittleFS 와 같은 한글 폰트 파일). 폰트를 받기 전엔 브라우저 글꼴로 잠깐 그렸다가 바꿔 그린다.
