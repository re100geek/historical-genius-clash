# Historical Genius Clash (HGC) v14.4.41

**Pixel Impact Edition** — 17명의 역사적 인물을 활용한 브라우저 도트 격투 게임.

## 실행

- `index.html`을 Chrome 등 브라우저에서 열어 로컬 모드를 플레이합니다.
- 배포 서버가 있는 경우 정적 웹 호스팅에 `index.html`을 배치합니다.
- 로컬 CPU 전투, 게임 메뉴, 게임기 UI 및 오프라인 콘텐츠는 별도 빌드 없이 실행하도록 만든 단일 HTML입니다.
- **온라인 1:1과 온라인 레이드는 별도의 실시간 게임 서버가 필요합니다.** 이 ZIP은 서버 구현·배포를 포함하지 않습니다.

## GitHub 저장소에 올리기

1. GitHub에서 저장소를 만듭니다.
2. 이 ZIP을 **압축 해제**합니다.
3. 저장소에서 **Add file → Upload files**를 열고 압축 해제한 `index.html`, `README.md`, `docs` 폴더 등을 업로드한 뒤 **Commit changes**를 누릅니다. 숨김 파일(`.nojekyll`, `.gitignore`)은 Git 명령으로 올릴 수도 있습니다.
4. GitHub Pages에 공개하려면 저장소 **Settings → Pages → Build and deployment → Deploy from a branch**, `main` / `(root)`을 설정하고 저장합니다. 공개 주소는 GitHub에서 확인할 수 있습니다.

> GitHub 저장소 화면에 ZIP 파일만 올리면 압축 안의 HTML이 자동으로 배포되지는 않습니다. 압축을 해제하여 파일을 올리세요.

## 폴더 구조

```text
index.html             # 게임 실행 파일 (외부 프런트엔드 파일 불필요)
README.md              # 설치 및 배포 가이드
.gitignore             # 불필요한 임시 파일 제외
.nojekyll              # GitHub Pages 정적 콘텐츠 인식
 docs/
  preview.png          # 게임 실행 화면 미리보기
  UPDATE_NOTES.md      # 최신 업데이트 설명
  QA_Results.json      # 이전 실행 검사 로그
```

## 이번 버전의 주요 연출

- 3초 전투 시작 카운트다운과 CPU 대기
- 패배 캐릭터의 픽셀 분해 연출
- 공격 스파크, 공격 궤적, 방어 파동, 회피 잔상, 착지 먼지
- 모바일 세로·가로 게임기 UI

## 검증 범위

이 패키지는 기존 **v14.4.41 HTML을 변경 없이** `index.html`로 복사했습니다. 이전 검사 기록은 `docs/QA_Results.json`을 참고하세요. 현재 패키징 과정에서는 JavaScript 구문 검사와 ZIP 무결성 검사를 수행했습니다. 온라인 서버 실전과 실제 모바일 기기별 호환성은 별도 검증해야 합니다.

## 권리 및 배포

외부 공개 전에 게임 안의 이미지·음악·폰트·인물 묘사 등 콘텐츠 사용 권한을 확인하세요. 별도 오픈소스 라이선스는 지정하지 않았습니다.
