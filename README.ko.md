[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | **한국어** | [Español](README.es.md) | [Português](README.pt.md)

<p align="center">
  <h1 align="center">Claude Journal</h1>
  <p align="center">
    <strong>단순한 뷰어가 아닙니다. AI와 대화하고, 기록을 편집하고, 모든 대화를 관리하세요.</strong><br>
    <em>Claude Code와 OpenAI Codex를 지원합니다. 변경 사항은 실제 파일에 반영됩니다.</em>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/v/claude-journal?color=c6603f&label=npm" alt="npm"></a>
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/dm/claude-journal?color=2f7613" alt="downloads"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-blue" alt="node">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  </p>
  <p align="center">
    <a href="https://arvid-pku.github.io/claude-journal/"><strong>인터랙티브 가이드</strong></a> &middot;
    <a href="https://www.npmjs.com/package/claude-journal">npm</a> &middot;
    <a href="https://github.com/Arvid-pku/claude-journal/releases">릴리스</a>
  </p>
</p>

<p align="center">
  <img src="figures/mainpage.png" alt="Claude Journal — 홈" width="800">
</p>

## 빠른 시작

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

그런 다음 [http://localhost:5249](http://localhost:5249)을 열어보세요. `~/.claude/projects`와 `~/.codex/sessions`를 자동으로 탐지합니다.

재부팅 후에도 동일한 명령어를 다시 실행하면 됩니다 — 재설치할 필요 없습니다.

---

## 단순한 뷰어가 아닙니다

대부분의 대화 기록 도구는 읽기 전용입니다. Claude Journal은 다릅니다:

### 브라우저에서 직접 대화하기

<p align="center">
  <img src="figures/Talk.png" alt="브라우저에서 Claude Code와 채팅" width="700">
</p>

플로팅 입력창에 메시지를 입력하면 Claude Code(또는 Codex)가 **정확히 같은 대화를 이어갑니다** — 동일한 세션, 동일한 컨텍스트. 실시간 파일 감시기를 통해 응답이 스트리밍됩니다. 터미널이 필요 없습니다.

### 실제 기록 편집하기

<p align="center">
  <img src="figures/Session Introduction.jpg" alt="주석 및 편집이 가능한 세션 뷰" width="800">
</p>

모든 변경 사항은 디스크의 실제 파일에 기록됩니다:

| 기능 | 설명 |
|--------|-------------|
| **세션 이름 변경** | JSONL에 `custom-title`을 기록합니다. `claude --resume "새-이름"`으로 즉시 불러올 수 있습니다. |
| **메시지 편집** | JSONL 파일의 메시지 내용을 업데이트합니다. 프롬프트 변경, 오타 수정, 대화 정리가 가능합니다. |
| **메시지 삭제** | JSONL에서 해당 줄을 제거합니다. 기록에서 해당 메시지를 영구적으로 삭제합니다. |
| **세션 복제** | 새 JSONL 파일을 생성합니다 — 실험할 수 있는 완전한 사본입니다. |
| **세션 이동** | JSONL을 프로젝트 디렉토리 간에 이동합니다(충돌 감지 포함). |

모든 쓰기 작업은 원자적으로 수행됩니다(임시 파일 + 이름 변경) — Claude Code가 같은 파일에 쓰고 있는 중에도 안전합니다.

---

## 기능

### 주석

별표, 하이라이트(5가지 색상), 댓글, 태그, 핀 기능을 메시지나 세션에 사용할 수 있습니다. Google Docs 스타일의 사이드 댓글과 자동 저장을 지원합니다. 사이드바에서 모든 세션의 주석을 탐색할 수 있습니다(별표 / 하이라이트 / 노트 / 태그). 주석은 별도로 저장되므로 JSONL 파일은 깨끗하게 유지됩니다.

### 분석 대시보드

<p align="center">
  <img src="figures/Analytics.png" alt="분석 대시보드" width="600">
</p>

일별 비용 및 토큰 차트, 활동 히트맵, 도구 사용 분석, 모델 분포, 비용 기준 상위 세션을 제공합니다. 날짜 범위 및 프로젝트별 필터링이 가능합니다. Claude Code와 Codex 모두에서 작동합니다.

### 스마트 디스플레이

- **편집 호출의 Diff 뷰** — 원시 텍스트 대신 빨간색/녹색 통합 diff 표시
- **도구 호출 그룹화** — 3개 이상의 연속 도구 호출을 요약으로 축소
- **세션 타임라인** — 첫 번째 프롬프트, 수정된 파일, 도구 사용 막대를 보여주는 개요 카드
- **코드 복사 버튼** — 모든 코드 블록에서 원클릭 복사
- **서브에이전트 확장** — 중첩된 Agent 대화를 인라인으로 보기
- **메시지 유형 필터** — Human, Assistant, Tool Calls, Thinking 및 특정 도구 유형 토글
- **접을 수 있는 메시지** — 헤더 클릭으로 긴 메시지 접기

### 멀티 프로바이더 지원

Claude Code와 OpenAI Codex를 하나의 통합 인터페이스에서 사용합니다. 사이드바에서 프로바이더 섹션을 접고 펼칠 수 있습니다. 프로젝트 폴더를 우클릭하여 고정하거나 숨길 수 있습니다. 설정에서 프로바이더별 필터링이 가능합니다.

### 세션 관리

세션을 우클릭하면: 고정, 이름 변경, 복제, 이동, 삭제, 다중 선택(일괄 삭제)이 가능합니다. 프로젝트 폴더를 우클릭하면: 상단 고정, 숨기기가 가능합니다.

### 키보드 단축키

`?`를 누르면 전체 목록을 볼 수 있습니다. 주요 단축키: `/` 검색, `j/k` 탐색, `Ctrl+E` 내보내기, `Ctrl+B` 사이드바, `g+a` 분석.

### 내보내기

Markdown 또는 자체 포함 HTML(인라인 CSS 포함, 누구에게나 공유 가능)로 내보낼 수 있습니다.

### 모든 기능은 토글 가능

모든 기능을 설정에서 비활성화할 수 있습니다. 간결함을 선호하는 사용자는 아바타, 타임라인, diff 뷰, 도구 그룹화, 코드 복사 버튼, 태그 등을 끌 수 있습니다.

---

## 설치

### 글로벌 설치 (권장)

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

### 기타 옵션

```bash
npx claude-journal                          # 설치 없이 바로 실행
claude-journal --daemon                     # 백그라운드 모드 (기본 포트 8086)
claude-journal --status                     # 확인: Running (PID 12345) at http://localhost:5249
claude-journal --stop                       # 데몬 중지
```

로그인 시 자동 시작:
```bash
pm2 start claude-journal -- --daemon --no-open --port 5249
pm2 save && pm2 startup
```

### 데스크톱 앱

GitHub Releases에서 [AppImage / DMG / EXE](https://github.com/Arvid-pku/claude-journal/releases)를 다운로드하세요.

> **macOS 사용자:** 앱이 코드 서명되어 있지 않습니다. macOS에서 _"손상됨"_ 메시지가 표시됩니다. 해결 방법:
> ```bash
> xattr -cr "/Applications/Claude Journal.app"
> ```

<details>
<summary>Docker / 소스에서 빌드</summary>

```bash
# 소스에서 빌드
git clone https://github.com/Arvid-pku/claude-journal.git
cd claude-journal && npm install && npm start

# Docker
docker build -t claude-journal .
docker run -v ~/.claude/projects:/data -p 5249:5249 -e PORT=5249 claude-journal
```
</details>

### 원격 접속

```bash
# SSH 터널 (권장):
ssh -L 5249:localhost:5249 user@server

# 또는 직접 접속을 위한 인증 사용:
claude-journal --daemon --auth user:pass --port 5249
```

VS Code Remote SSH는 포트를 자동으로 포워딩합니다 — 터미널에서 `claude-journal`을 실행하기만 하면 됩니다.

---

## 아키텍처

```
claude-journal/
  server.js                Express + WebSocket 서버 (채팅, 주석, 분석)
  bin/cli.js               CLI 데몬 모드, Node 18+ 확인
  providers/
    codex.js               Codex 프로바이더 (~/.codex/ 읽기, SQLite + JSONL)
  public/
    modules/               순수 JS ES 모듈 (빌드 과정 없음)
      main.js              앱 초기화, 라우팅, 채팅, 키보드 단축키
      messages.js           렌더링, diff 뷰, 타임라인, 도구 그룹화, 태그
      sidebar.js           세션 목록, 프로젝트 관리, 일괄 작업
      analytics.js         차트, 히트맵, 프로젝트 대시보드
      search.js            필터가 있는 전역 검색
      state.js             공유 상태, 유틸리티, diff 알고리즘
  tray/                    Electron 시스템 트레이 앱 (선택 사항)
  tests/                   Playwright E2E 테스트
```

**빌드 과정이 없습니다.** ES 모듈을 사용한 순수 바닐라 JS입니다. React, 번들러, 트랜스파일러가 없습니다.

---

## 작동 방식

1. **서버**가 `~/.claude/projects/`와 `~/.codex/sessions/`에서 대화를 검색합니다
2. **Codex 프로바이더**가 Codex 이벤트(`function_call`, `reasoning` 등)를 Claude 형식으로 변환합니다
3. **WebSocket**이 활성 세션 파일의 실시간 업데이트를 감시하고, 채팅 메시지를 `claude`/`codex` CLI로 전달합니다
4. **주석**은 `annotations/`에 별도로 저장됩니다 — 명시적으로 편집/삭제하지 않는 한 대화 파일을 수정하지 않습니다
5. **채팅**은 `claude --resume <id> --print` 또는 `codex exec resume <id> --json`을 서브프로세스로 실행합니다
6. **모든 편집**은 원자적 쓰기를 사용하여 동시 접근으로 인한 손상을 방지합니다

---

## 알려진 제한 사항 및 도움 요청

Claude Journal은 사이드 프로젝트에서 유용한 도구로 성장했습니다. 다듬어야 할 부분이 있습니다:

| 제한 사항 | 세부 내용 |
|-----------|---------|
| **Codex 메시지 편집 미지원** | Codex JSONL 형식(`event_msg`/`response_item` 래퍼)이 Claude와 다릅니다. 개별 Codex 메시지의 편집/삭제는 아직 구현되지 않았습니다. |
| **비용 추정은 근사값** | API 환산 비용(입력 + 출력 토큰)을 표시합니다. 캐시 토큰은 제외됩니다. 실제 청구 금액은 구독 플랜에 따라 다릅니다. |
| **모바일 레이아웃 없음** | UI는 데스크톱 전용입니다. 사이드바가 작은 화면에 맞게 조정되지 않습니다. |
| **서명되지 않은 데스크톱 앱** | macOS에서 열려면 `xattr -cr`이 필요합니다. 정식 코드 서명에는 Apple 개발자 인증서($99/년)가 필요합니다. |
| **단일 사용자 전용** | 사용자 계정이나 멀티 테넌트를 지원하지 않습니다. 개인 머신에서의 사용을 위해 설계되었습니다. |
| **편집 중 불안정한 실시간 업데이트** | WebSocket 파일 감시기가 메시지 조작 중에 DOM을 다시 빌드할 수 있습니다. |

**기여를 환영합니다!** 이 중 하나라도 도움을 주고 싶으시다면, [github.com/Arvid-pku/claude-journal](https://github.com/Arvid-pku/claude-journal)에서 이슈 또는 PR을 열어주세요.

있으면 좋을 아이디어:
- 모바일 반응형 레이아웃
- Codex 메시지 편집 지원
- .dmg용 Apple 코드 서명
- 추가 프로바이더 (Cursor, Windsurf, Aider 등)
- 세션 비교 (두 대화의 나란히 비교)
- 대화 요약 (자동 생성 세션 요약)

---

## 요구 사항

- **Node.js** 18 이상
- **Claude Code** (`~/.claude/projects/`) 및/또는 **OpenAI Codex** (`~/.codex/sessions/`)

## 라이선스

MIT

---

<p align="center">
  <a href="https://github.com/Arvid-pku">Xunjian Yin</a>이 만들었습니다
</p>
