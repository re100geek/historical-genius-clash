# HGC v14.3.6 — 서버 없는 기기 프로필·백업·진행도 대시보드

**개발 기준:** HGC v14.3.5 시대 탐험까지 포함된 전체 소스. 게임 원화, 기존 필살기, 시련의 탑 99층, 태그 팀 배틀, 시대 탐험 및 온라인 대전 코드는 보존했습니다.

## 서버 없는 기기 로그인 (새 기능)

1. 단독 `index.html` 실행 후 **로그인 · 계정** 탭을 엽니다.
2. **기기 내 로그인 · 오프라인 저장**에서 프로필 이름과 8자 이상 비밀번호를 등록합니다.
3. 해당 브라우저에 저장된 게스트 진행도가 처음 생성한 프로필로 복사됩니다.
4. 프로필마다 진행도를 구분하고, 자동 저장(2.5초)·지금 저장·JSON 백업·가져오기를 사용합니다.
5. 서버 없이 같은 브라우저에서 이어하기가 가능합니다. 다른 기기에서는 JSON 파일을 직접 옮기고 별도 프로필을 만들어 가져옵니다.
6. 로그인 화면의 **훈련·대전 / 시련의 탑 / 시대 탐험** 바로가기와 진행도 대시보드를 사용할 수 있습니다.

**중요:** 이 기능은 실제 온라인 계정 동기화가 아니라 로컬 프로필 저장입니다. 비밀번호는 PBKDF2 해시로 보관하지만 게임 진행도 자체는 암호화되지 않습니다. 브라우저 데이터 삭제·시크릿 모드·기기 교체 시 기록이 유지된다고 보장하지 않습니다. 자주 JSON 백업을 내보내세요. 실제 서버 계정은 기존 `/api/auth` 인터페이스로 별도 유지됩니다.

## 검증

```bash
npm run check
python3 tools/verify_offline_upgrade.py
python3 tools/sync_offline_profiles.py
python3 tests/qa_local_profile_browser.py
```

- Node 테스트 28개 PASS (오프라인 프로필 신규 6개 포함).
- Chrome PC/모바일 브라우저 UI 테스트 PASS (관리자 네트워크 정책으로 저장소 및 WebCrypto를 대체한 Mock-origin 테스트).
- 원본 HTML에서 삽입된 세 모듈 및 의도적인 계정 안내 변경만 제거하면 v14.3.5 원본과 **완전 일치**.
- 상세: `docs/LOCAL_PROFILE_V1436.md`.

---

# HGC v14.3.2 — Online Arena + 17 Motion QA

**현재 플레이 버전:** v14.3.2. 기존 v14.3.1의 캐릭터 17명, 컷씬 17종, 무기 스킨 51종, 시련의 탑 99층, 계정 저장 데이터는 유지했습니다.

## 실행

Node.js 20 이상을 설치하고 프로젝트 루트에서:

```bash
npm start
```

브라우저에서 `http://localhost:8787`에 접속합니다. 온라인 대전은 같은 서버의 WebSocket `/ws`를 사용합니다. PC/모바일은 동일 호스트로 접속해야 합니다. 설정 예:

```bash
PORT=8787 HOST=0.0.0.0 HGC_DATA_DIR=/var/data/hgc npm start
```

- `index.html`만 열면 게스트 로컬 플레이가 가능합니다. 온라인 대전과 계정 로그인은 Node 서버가 필요합니다.
- **HGC_DATA_DIR**은 서버 재시작 후에도 남는 영구 디스크 경로로 설정합니다. 단일 인스턴스/JSON 파일 저장용 서버입니다.
- 인터넷에 공개할 때는 HTTPS/WSS 프록시와 지속형 데이터 경로를 사용해야 하며, `TRUST_PROXY=1`은 **신뢰할 수 있는 HTTPS 역방향 프록시 뒤에서만** 설정합니다.
- 운영 환경 인증·재접속·부하 테스트가 끝나기 전에는 상용 운영이 검증됐다고 표시하지 않습니다.

## 이번 수정

1. v14.1 원본의 WebSocket v10.3 경기 서버 로직을 `online-arena.js`로 분리해 기존 v14.3.1 계정 서버에 결합했습니다. 권위 있는 판정/스탯/타이밍을 유지했습니다.
2. 신규 4명의 필살기 사거리 누락을 수정했습니다. 이제 온라인에서 맵 반대편을 맞히는 오류를 방지합니다. 기존 13명 사거리 값은 그대로입니다.
3. 신규 4명의 특수 발동 타이밍을 **게임에 실제 정의된 컷씬 타이밍**에 맞췄습니다: 잭슨 14, 조던 18, 펠레 16, 이순신 21.
4. Node 계정 복구 테스트, 서버 재시작 후 영구 기록 복원 테스트, WebSocket 실제 공격/게이지·재입장 테스트를 추가했습니다.
5. PC/모바일 Chromium에서 각기 다른 브라우저 컨텍스트로 실제 WebSocket 두 클라이언트를 연결해 온라인 대전을 검증했습니다.
6. **17명 현행 21프레임 GIF**를 `docs/qa/motions_17/`에 생성했습니다. 기존 13명의 대기·걷기 프레임에 관절 미세 변형을 적용한 **별도 비교 시제품**도 생성했습니다. 사용자가 승인할 때까지 게임 내 기존 캐릭터 아틀라스는 교체하지 않습니다.
7. 기존 필살기 17종 컷씬, 공격 설계, 아틀라스 및 모든 사용자 승인 원화는 그대로 보존했습니다.

## 테스트

```bash
npm test
node --check server.js
node --check online-arena.js
python3 tools/verify_four_integration.py
python3 tests/verify_newcomer_visual_sync.py
python3 tests/browser_test.py
python3 tests/qa_online_browser_live.py
python3 tools/review_all_17_motions.py
python3 tools/prototype_17_joint_motion.py
```

Playwright/Chromium, Pillow, numpy 필요. `npm test`는 Node 표준 라이브러리와 Node 내장 WebSocket 구현을 사용합니다.

## 파일 구분

- `HGC_v14_3_2_Game.html`: 게임 HTML만(오프라인/게스트용).
- `HGC_v14_3_2_Deploy.zip`: 서버+게임, Node 서버와 WebSocket/계정 저장 가능.
- `HGC_v14_3_2_Full_Source.zip`: 게임과 추가 개발 도구/규칙/검수 자료.
- `HGC_v14_3_2_17_Motion_GIFs.zip`: 17명 현행 GIF + 기존 13명 관절 시제품 비교 GIF 및 검수 이미지.

## 남은 작업

- 전체 17명에게 사람이 직접 그린 21프레임씩 총 357컷을 완성하고 사용자 스타일 승인. 기존 시제품을 완성품으로 간주하지 않습니다.
- 실제 운영 HTTPS/WSS 서버·지속형 DB, 서버 재시작/네트워크 오류, 여러 기기 로그인, 부하·보안 검증. 현재는 **로컬 환경의 실제 프로토콜 테스트**까지 완료됐습니다.

## v14.3.3 애니메이션·HTTPS/WSS 추가 QA (게임 로직 유지)

```bash
npm run check
npm run qa:motion
npm run qa:tls
python3 tools/qa_17_joint_candidates.py
python3 tools/release_gate.py --enforce
```

- 마지막 명령은 실제 357컷 수작업 원화와 공개 운영 저장 검증이 완료되기 전까지 **의도적으로 실패**합니다.
- 17명 GIF: `docs/qa/motions_17/review_v1433/index.html`.
- 로컬 자체 서명 TLS/WSS와 공개 인터넷 검증을 구분합니다.
- 자세한 상태: `docs/V1433_QUALITY_HANDOFF.md`.

## v14.3.4 · 신규 콘텐츠 개발 1순위: 태그 팀 배틀 (테스트판)
**추가 탭:** `태그 팀 배틀 · 2v2` → 선발/교체 두 명씩 선택 → `2대2 팀 배틀 시작`.
지원: 1인 vs CPU 팀, 로컬 2인 대전. 양 팀 한 명씩 실전 출전, 교체 버튼으로 교대. HP와 게이지는 개별 보존, KO면 예비 자동 출전. 팀원 둘 모두 KO여야 패배.

검사:
```sh
npm run check
python3 tests/qa_tag_team_browser.py
python3 tests/browser_test.py
```
전투 엔진은 기존 v14.3.3을 기반으로 하며, `src/modes/tag-team-rules.js`가 공통 태그 규칙이다. HTML에도 동일 내용을 내장한다.
**아직 구현되지 않은 것:** 온라인 2대2, 시대 탐험, 협동 보스 레이드. 향후 우선순위·완료 기준은 `docs/PRD_NEW_MODES_V1434.md`에 있다.
기존 필살기·무기·기준 원화, 시련의 탑, 계정 및 온라인 1대1은 변경하지 않았다. 기존 정식 릴리스 차단 규칙은 유지한다.


## v14.3.5 · 시대 탐험 (Era Expedition)
기존 **태그 팀 배틀/시련의 탑/17인 필살기**를 그대로 사용하면서, 두 번째 신규 모드를 실제로 구현했습니다. 게임에서 `시대 탐험 · 로그라이크` 탭을 선택해 시작할 수 있습니다.

- 17명 중 도전자 선택 → 고대/르네상스/근현대 출발 시대 선택 → 시드(선택) → 3막 × 4노드 도전.
- 각 노드에서 A/B 경로 선택: 기존 CPU 전투, 휴식, 연구, 이벤트, 막 보스. 각 막 네 번째 노드에는 반드시 보스가 있습니다.
- 전투 결과는 기존 HGC의 KO/타임업 판정으로 결정됩니다. 체력·에너지와 세션 한정 보정이 다음 전투에 전달됩니다. 패배 시 종료 기록이 남습니다.
- 메뉴 이탈·재접속 시 pending 전투는 이어하기로 다시 시작합니다. 전투 종료 전에 보상을 얻을 수 없습니다.
- 저장키 `historicalGeniusClash.eraExpedition.v1`; 로컬 JSON 백업, 기존 게임 계정 프로필 동기화 대상입니다. HTML 단독 실행 시 게스트 로컬 저장만 지원합니다.

**개발:** `src/modes/era-expedition-rules.js`(순수 분기 로직), `src/modes/era-expedition-integration.js`(UI/기존 전투 엔진 통합), `tools/sync_era_modules.py`(단일 HTML 내장).

```bash
python3 tools/sync_era_modules.py
npm run check
python3 tests/qa_era_browser.py
python3 tests/qa_tag_team_browser.py
```

**상태:** 로컬 CPU 로그라이크 MVP PASS. 브라우저 검증은 환경 정책상 메모리 저장소 스텁을 활용했으며, 정식 공개 서버의 저장 영속성·동기화·수작업 아트 승인은 별도 확인이 필요합니다. 협동 보스 레이드는 다음 개발 단계입니다.
