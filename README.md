# Historical Genius Clash v13.4 — Chronicle Arsenal Visual Unity

2026-11-07 기준. 업로드된 **1536×1152 Chronicle Arsenal 레퍼런스 이미지**의 무기 원화를 실제 게임 아트 자산으로 통합하고, UI와 전장을 남색·금색 픽셀 아케이드 스타일로 통일한 릴리스입니다.

## 무엇이 바뀌었나

- 사용자가 제공한 이미지에서 **13개 인물별 고유 무기 원화**를 분리해 배경 투명화했습니다.
- 각 캐릭터의 기존 3가지 스킨을 시각적으로 구분한 3가지 도트 장비 변형(총 **39종**). 26종은 같은 원본을 바탕으로 색상·장식 변형했습니다.
- **실제 PNG 디자인 기반 이미지**를 `ArcadeWeaponVisuals`로 렌더링합니다. 기존처럼 Canvas 도형으로 재해석하지 않습니다.
- **CPU·로컬·온라인** 기본/장착 무기, 무기 상점과 무기 뽑기 컷씬, 39종 가챠 도감의 무기 그래픽을 통일했습니다.
- 무기 수집 카드 39개 모두 도트 미리보기를 추가하고 기본 무기도 `DEFAULT` 문자가 아닌 실제 그림으로 보여줍니다.
- 전장 **10종**, 선택 메뉴, 스토리, 계정/로그인, 가챠, 상점, 경기 HUD를 **짙은 남색·골드 픽셀 베벨 테마**로 통일했습니다.
- 기존 캐릭터 13명의 디자인·움직임·필살기 컷씬, 로그인 UI, 온라인 대전, 게임 데이터와 골드 경제 시스템은 유지했습니다.

## 테스트 결과

- 게임 브라우저 회귀검사 **194/194** 통과.
- 모든 무기 이미지 **39/39 로딩**, 52개 상점 카드, 무료 기본 무기 표시, 가챠 및 컷씬·PC·모바일 DOM 렌더 정상.
- 로그인 및 API **4/4** 테스트 통과.
- 실제 Node.js WebSocket 2인 연결: 방 만들기·참가·서로 다른 전용 무기 ID·준비·대전 시작 통과.
- 무료 게임 골드 24개 상태로 1회 뽑기 → 골드 22, 보유 스킨 1종, 즉시 장착·저장 통과.
- 브라우저에서 Node 서버의 localhost 접속은 테스트 환경 정책상 차단됨. 브라우저 UI와 실제 2인 WebSocket 서버 테스트를 분리하여 검증했습니다.
- GitHub/Render **공개 배포 및 실사용자 환경의 2인 브라우저 테스트는 아직 진행하지 않았습니다.**

## 배포 방법 (기존 사이트 유지)

1. ZIP을 내려받아 압축을 풉니다.
2. GitHub 저장소 `re100geek/historical-genius-clash`의 `main` 루트에 `index.html`, `server.js`, `package.json`, `render.yaml`과 `auth/` 폴더를 업로드합니다. 같은 이름의 기존 파일을 교체합니다.
3. `Commit changes`를 누릅니다.
4. Render 기존 서비스에서 GitHub 최신 배포가 Live로 변경됐는지 확인합니다.
5. 게임 메뉴 상단 **CHRONICLE ARSENAL / V13.4**를 확인합니다. 서버의 `/health`는 게임 UI 버전이 아닌 기존 WebSocket **10.3 프로토콜** 버전을 표시합니다.
6. 로그인 영구 저장은 별도 PostgreSQL `DATABASE_URL` 설정이 필요합니다. 비밀번호/URL을 GitHub에 커밋하지 마세요.

게임 주소: https://historical-genius-clash-online.onrender.com

## 전체 개발 소스

- `src/base_deploy_v13_3.zip`: 변경 전 기존 게임과 서버 소스 압축 파일.
- `assets/reference_input.png`: 사용자가 제공한 스타일 원본 이미지.
- `weapons/*.webp`: **39개 투명 픽셀 무기 스프라이트**.
- `src/arcade-weapon-sprites.js`: 인라인되는 단일 무기 아트 렌더러.
- `src/arcade-stage.js`: 10종 전장의 공통 픽셀 프레임.
- `src/arcade-style.css`: 메뉴·HUD·상점·로그인·가챠 공통 디자인 시스템.
- `scripts/extract_reference_weapons.py`: 참고 이미지에서 무기 추출 및 39개 변형 생성 (Pillow, OpenCV, NumPy).
- `scripts/build_134.py`: 단일 `index.html`을 생성 (Python 표준 라이브러리).
- `tests/qa_browser.py`: Chromium 브라우저 UI·회귀·모바일 검사.
- `tests/qa_online_gacha.py`: 서버 실시간 WebSocket 2인·가챠·저장 검사.
- `tests/account.test.js`, `tests/integration.test.js`: Node 로그인 테스트.

## 데이터 호환

기존 39종의 **무기 ID, 레어도, 가격, 보유 상태, 장착 상태, 캐릭터 ID, 계정 모듈, 전투 수치**는 바꾸지 않았습니다. 기존 사이트에서 브라우저 출처와 로컬 저장소가 같으면 저장 기록이 유지됩니다.

**게임 v13.4 / 온라인 프로토콜 v10.3** (의도된 버전 구분).
