# Historical Genius Clash (HGC) v14.4.41

**Pixel Impact Edition** — 17명의 역사적 인물을 활용한 브라우저 도트 격투 게임.
단일 `index.html`로 오프라인 플레이가 가능하고, `server.js`를 실행하면 계정 저장·온라인 1:1 대전·온라인 협동 레이드까지 같은 서버에서 동작합니다.

## 실행

### 1) 서버로 실행 (권장: 온라인 기능 전체 사용)

```bash
npm start          # node server.js
# 기본 주소: http://localhost:8787
```

- Node.js 20 이상, 외부 npm 패키지 없음(`dependencies` 없음).
- `GET /` 또는 `/index.html`이 게임 화면을 제공하고, 같은 서버가 계정 API·온라인 대전·협동 레이드를 함께 처리합니다.
- 저장 데이터(계정·프로필)는 기본적으로 `./data/accounts.json`에 기록됩니다. 이 파일에는 비밀번호 해시가 들어 있으므로 **절대 커밋하지 마세요** (`.gitignore`에 `data/` 포함).

### 2) 정적 호스팅 (오프라인 플레이만)

- `index.html`을 Chrome 등 브라우저에서 열거나 정적 웹 호스팅에 배치하면 로컬 CPU 전투, 한 기기 2인 협동, 시대 원정, 오프라인 프로필을 사용할 수 있습니다.
- 정적 호스팅만으로는 온라인 1:1·협동 레이드가 동작하지 않습니다. 온라인 모드는 `/ws`, `/raid` WebSocket을 제공하는 이 저장소의 Node 서버가 필요합니다.

## 배포 (Render)

`render.yaml`에 웹 서비스 정의가 들어 있습니다.

| 항목 | 값 |
| --- | --- |
| 서비스 이름 | `historical-genius-clash-online` |
| 빌드 | `npm install --omit=dev && npm run check` |
| 시작 | `npm start` |
| 헬스 체크 | `/health` |

- 라이브 인스턴스: <https://historical-genius-clash-online.onrender.com> (`/health`, `/api/release`로 버전 확인)
- 무료 플랜은 재시작 시 파일 시스템이 초기화될 수 있습니다. 계정과 프로필을 유지하려면 Render 디스크를 붙이고 `HGC_DATA_DIR`를 그 경로로 지정하세요.
- HTTPS 뒤에서 세션 쿠키에 `Secure`를 붙이려면 `TRUST_PROXY=1`을 설정합니다(Render는 프록시 뒤에서 `X-Forwarded-Proto`를 보냅니다).

### 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `8787` | HTTP/WebSocket 포트 |
| `HOST` | `0.0.0.0` | 바인드 주소 |
| `HGC_DATA_DIR` | `./data` | 계정 DB(`accounts.json`) 디렉터리. 영속 디스크 권장 |
| `TRUST_PROXY` | (꺼짐) | `1`이면 프록시의 `X-Forwarded-Proto: https`를 신뢰해 `Secure` 쿠키 발급 |
| `ALLOWED_ORIGINS` | (없음) | 같은 호스트가 아닌 오리진 허용 목록(쉼표 구분) |
| `RENDER_GIT_COMMIT` | (없음) | Render가 주입. `/api/release`의 `commit` 값으로 사용 |

## 라우트와 프로토콜

| 경로 | 방식 | 설명 |
| --- | --- | --- |
| `/` · `/index.html` | GET | 게임 화면(단일 HTML) |
| `/health` | GET | `{status, online, gameVersion, commit, characters}` |
| `/api/release` | GET | `{gameVersion, protocolVersion, raidProtocolVersion, commit, features}` |
| `/api/auth/status` · `/api/auth/session` | GET | 계정 기능 가용 여부 · 현재 세션 |
| `/api/auth/profile` | GET · PUT | 프로필 조회 · 리비전 기반 저장 |
| `/api/auth/register` · `/api/auth/login` · `/api/auth/logout` | POST | 가입 · 로그인 · 로그아웃 |
| `/ws` | WebSocket | 온라인 1:1 대전(규칙 버전 10.3). `create`/`join`/`ready`/`input`/`rematch`/`leave` |
| `/raid` | WebSocket | 온라인 협동 보스 레이드. `raid_create`/`raid_join`/`raid_ready`/`raid_start`/`raid_input`/`raid_rematch`/`raid_leave` → `raid_hello`/`raid_joined`/`raid_lobby`/`raid_started`/`raid_state`/`raid_result`/`raid_notice`/`raid_error` |

협동 레이드는 서버가 권위자입니다. `online-arena.js`가 `index.html`의 `HGC_RAID_RULES` 블록(오프라인과 동일한 결정론적 규칙)을 읽어 30Hz로 시뮬레이션하고, 15Hz로 상태를 동기화합니다. 그래서 온라인과 오프라인이 같은 전투 규칙을 사용하며 두 벌의 규칙이 따로 어긋나지 않습니다.

## 저장소 구조

```text
index.html                  # 게임 본체(단일 파일). 오프라인 규칙·아트·UI가 모두 인라인
server.js                   # HTTP 서버: 정적 화면, 계정 API, /health, /api/release
online-arena.js             # /ws 온라인 1:1 아레나 + /raid 협동 레이드(권위 시뮬레이션)
package.json                # 릴리스 버전 단일 출처(version)와 실행·검사 스크립트
render.yaml                 # Render 웹 서비스 정의
tests/*.test.js             # node:test 기반 자동 검사(계정·온라인·레이드·버전·모드 규칙)
era-expedition-rules.js     # 시대 원정 규칙(테스트가 참조하는 분리 모듈, HTML에도 인라인)
tag-team-rules.js           # 태그 팀 규칙(테스트 참조용 분리 모듈)
offline-profiles.js         # 오프라인 프로필 저장 로직(테스트 참조용 분리 모듈)
offline-profile-ui.js       # 오프라인 프로필 화면 보조 스크립트
account-store.js            # 초기 계정 저장소 구현(서버는 server.js 내 구현 사용)
account-api.js              # 초기 계정 API 구현(서버는 server.js 내 구현 사용)
account-ui.js · account-ui.css  # 초기 계정 화면 자산
release/recovery-guard.js · .css # 기록 복구 가드(배포용 사본)
HGC_v13_4_Chronicle_Arsenal_PLAY-1.html # v13.4 보관용 원본
QA_Results.json · UPDATE_NOTES.md       # 이전 QA 로그와 업데이트 노트
.gitignore                  # node_modules·data(계정 DB)·로그 등 제외
```

## 테스트

```bash
npm test        # node --test tests/*.test.js
npm run check   # server.js·online-arena.js 구문 검사 + npm test (Render 빌드에서 실행)
```

- 계정: 가입·로그인·세션·프로필 리비전·재시작 후 유지(`account.test.js`, `account-persistence.test.js`)
- 온라인 1:1: 실제 WebSocket 2인 방·입력·필살기 판정(`online.test.js`)
- 협동 레이드: 방 생성·참가·준비·시작 게이트·보스 피해·중도 이탈·재대전(`raid.test.js`)
- 릴리스: 버전 단일 출처·`/api/release`의 `gameVersion`/`commit`(`release.test.js`)
- 모드 규칙: 시대 원정·태그 팀·타워·오프라인 프로필(`era-expedition.test.js`, `tag-team.test.js`, `tower.test.js`, `offline-profiles.test.js`)

Node.js 22 이상을 권장합니다. Node.js 20 이하에는 전역 `WebSocket`이 없어 온라인 1:1·협동 레이드 WebSocket 테스트 6개는 건너뛰고(실패 아님) 나머지 검사는 그대로 실행됩니다.

## 버전 관리 규칙

- 릴리스 버전의 단일 출처는 `package.json`의 `version`입니다.
- `server.js`는 이 값을 읽어 `/api/release`와 `/health`의 `gameVersion`으로 내보내고, `commit`에는 `RENDER_GIT_COMMIT`(있으면) 또는 로컬 `git rev-parse --short HEAD` 값을 넣습니다.
- `index.html`의 `GAME_VERSION`과 화면 버전 표기는 같은 값이어야 합니다. 게임 내 **게임 버전 확인**은 서버 `gameVersion`과 화면 `GAME_VERSION`을 비교하므로, 두 값이 다르면 "버전 불일치"가 표시됩니다. `tests/release.test.js`가 이 일치를 강제합니다.
- 버전을 올릴 때는 `package.json`과 `index.html`의 `GAME_VERSION`을 함께 수정하고 `npm test`를 실행하세요.

## 이번 버전(v14.4.41)에서 정리한 것

- 버전 표기 통일: `package.json`(14.3.6) · `/api/release`(14.3.2) · 화면 `GAME_VERSION`(14.3.8)으로 갈라져 있던 값을 **14.4.41 하나로 통일**하고, `/api/release`에 `commit` 필드를 추가했습니다.
- 온라인 협동 레이드 서버 구현: 클라이언트가 `/raid`로 보내는 `raid_*` 프로토콜에 맞춰 방 생성·참가·준비·시작·전투 동기화·재대전·퇴장을 `online-arena.js`에 추가했습니다. 이전에는 `/raid` 연결이 즉시 끊겨 온라인 협동이 동작하지 않았습니다.
- 저장소 위생: `.gitignore` 추가(계정 DB `data/`·해시 포함), 테스트를 `tests/`로 모아 `npm test`가 실제로 실행되도록 수정, 이 문서를 실제 실행 방법과 구조에 맞게 갱신했습니다.

## GitHub 저장소에 올리기

1. GitHub에서 저장소를 만듭니다.
2. 이 저장소를 받은 경우 **압축 해제** 후 폴더에서 `git init` → `git add .` → `git commit` → `git push`로 올립니다.
3. GitHub 웹에서 올릴 때는 **Add file → Upload files**로 `index.html`, `README.md` 등을 올리고 **Commit changes**를 누릅니다. 숨김 파일(`.gitignore`)은 Git 명령으로 올릴 수도 있습니다.
4. GitHub Pages에 공개하려면 저장소 **Settings → Pages → Build and deployment → Deploy from a branch**, `main` / `(root)`을 설정합니다. 공개 주소는 GitHub에서 확인할 수 있습니다.

> GitHub Pages는 정적 호스팅이므로 오프라인 모드만 동작합니다. 온라인 1:1·협동 레이드는 `render.yaml`처럼 Node 서버로 배포해야 합니다.

## 검증 범위

- `npm run check`(구문 검사 + 자동 테스트)는 CI/Render 빌드에서 실행됩니다.
- 실제 모바일 기기별 호환성, 장시간 프레임 유지, 온라인 실전 지연은 별도 검증이 필요합니다. 이전 실행 기록은 `QA_Results.json`, 연출 변경 이력은 `UPDATE_NOTES.md`를 참고하세요.

## 권리 및 배포

외부 공개 전에 게임 안의 이미지·음악·폰트·인물 묘사 등 콘텐츠 사용 권한을 확인하세요. 별도 오픈소스 라이선스는 지정하지 않았습니다.
