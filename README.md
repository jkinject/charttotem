# 차트토템 런처 (PWA)

책상에 세워두는 투자자의 작은 토템, **차트토템** 기기를 폰에서 관리하는 설치형 웹앱.
GitHub Pages 로 호스팅: https://jkinject.github.io/charttotem/

- 기기 목록(여러 대), 온보딩/기기 QR 로 자동 등록 (`?add=1&id=&ip=&host=&ssid=`)
- 가격·연결 상태 확인, 종목 변경(낙관적 업데이트) — Chrome(안드로이드) 의 Local Network Access 로 HTTPS 페이지에서 기기(HTTP) 와 통신
- 같은 Wi-Fi 대역 스캔으로 기기 찾기, 주소 직접 입력
- 오프라인에서도 열리는 문제 해결 가이드, 홈 화면 설치 안내
- 빌드 없음. 정적 파일 그대로 배포 (`index.html`, `app.js`, `sw.js`, `style.css`, `manifest.json`, `icons/`)

펌웨어 쪽 연동: 기기의 `src/brand.h` `LAUNCHER_URL` 이 이 주소. 도메인을 바꾸면 거기도 바꿔서 OTA.
`sw.js` 의 `CACHE` 이름을 올리면 설치된 앱이 새 파일을 받는다.
