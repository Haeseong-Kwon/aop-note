# AOP Note

업무 정리 메모 데스크톱 앱. 로컬 우선(offline-first) — 네트워크 없이 완전히 동작합니다.

데스크(Desk) → 분야/프로젝트(Category, 1단계 중첩) → 작업(Task)의 3단계 구조로 일을 정리하고,
데스크별 **작업 / 달력 / 목표** 3가지 모드로 관리합니다.

- **작업**: 리스트 / 칸반 듀얼 뷰. 작업을 클릭하면 그 자리에서 **인라인 확장**되어 바로 편집합니다(별도 화면 전환 없음).
- **달력**: 마감일 기반 오프라인 월간 달력. 데스크 전체 일정을 한눈에.
- **목표**: 데스크별 목표를 만들고 작업을 연결하면 완료율 기반 **진행률**이 자동 계산됩니다.

### v0.2 — UX 개선
- **키보드 우선 조작**: `j/k` 이동, `Enter` 열기, `Space/x` 완료, `e` 제목 편집, `0–3` 우선순위. `?`로 단축키 도움말. ([단축키 표](#단축키))
- **인라인 편집**: 제목(더블클릭·`e`), 기한(인라인 날짜 피커), 우선순위(클릭 순환·숫자키) — 모달 없이 즉시 반영.
- **드래그앤드롭 정렬**: 리스트 순서, 칸반 컬럼 내·컬럼 간 이동, 카테고리 순서 (@dnd-kit).
- **스마트 뷰 "오늘 / 이번 주"**: 모든 데스크를 가로질러 마감일로 작업을 모아 봅니다. 사업/카테고리 컨텍스트 라벨 + 지난 작업 강조.
- **검색 / 빠른 이동 팔레트**: `⌘/Ctrl + P`로 작업·카테고리·데스크 통합 검색 후 키보드로 즉시 이동.
- **OS 네이티브 알림**: 오늘 마감 작업을 알림으로. 클릭 시 앱 포커스 + 해당 작업으로 이동.
- **다크 / 라이트 / 시스템 테마**: 토글 + OS 설정 따라가기 (선택값 영속).

### v0.3 — 문서 첨부 + 인앱 뷰어
- 작업에 **문서를 첨부**(파일 선택 + 드래그앤드롭)하고, **앱 안에서 바로 미리보기**.
- 지원: PDF·이미지(내장 뷰어), Word(.docx), Excel(.xlsx/.xls/.csv, 시트 탭), 텍스트(.txt/.md/.json). 그 외 형식은 "외부 앱으로 열기".
- 파일은 `userData/attachments/`에 복사되어 오프라인 보존, 변환 HTML은 DOMPurify로 살균.

### v0.4 — 메모(노션/옵시디언 지향)
- **마크다운 메모**: 편집/미리보기 토글 + 서식 툴바, GFM(표·체크리스트·취소선) 렌더.
- **전체화면 보기**(편집+미리보기 분할), 미리보기 **체크박스 클릭 토글**(소스 반영).
- **리스트 인라인 메모 토글**: 메모 있는 작업을 행에서 바로 펼쳐 읽기.
- **익스포트**: 메모를 **.md / .html / .pdf**로 내보내기.

### v0.5 — 문서함
- 데스크 상단 **문서** 탭에서 업로드한 모든 문서를 **카테고리별 폴더**로 모아보기(Finder식 드릴인).
- 폴더 → 문서 카드 클릭으로 인앱 뷰어 열람, 해당 작업으로 이동, 삭제.

## 기술 스택

| 영역 | 사용 |
| --- | --- |
| 셸 | Electron + electron-vite |
| UI | React + TypeScript |
| 상태관리 | Zustand |
| 스타일 | Tailwind CSS + shadcn/ui 스타일 프리미티브 |
| 로컬 DB | better-sqlite3 (메인 프로세스, IPC로 렌더러와 통신) |
| 드래그앤드롭 | @dnd-kit |
| 패키지 매니저 | npm |

## 아키텍처

```
src/
├── main/                 # 메인 프로세스 (Node)
│   ├── index.ts          # 앱 진입점 + BrowserWindow (contextIsolation ON, nodeIntegration OFF)
│   ├── db/
│   │   ├── index.ts      # SQLite 연결 (userData 경로, WAL, FK)
│   │   └── migrations.ts # user_version 기반 자동 마이그레이션
│   ├── repositories/     # DB 쿼리 계층 (workspace / category / task / goal / search)
│   ├── notifications.ts  # 오늘 마감 작업 OS 알림 (60초 주기 + 포커스 시)
│   └── ipc/handlers.ts   # ipcMain.handle 등록
├── preload/index.ts      # contextBridge로 window.api 노출 (+ 알림 클릭 이벤트)
├── shared/               # 메인·렌더러 공용 타입 + IPC 채널 계약
└── renderer/src/         # React UI
    ├── store/useStore.ts          # Zustand 스토어 (window.api 호출)
    ├── shortcuts.ts               # 단축키 키맵 (단일 출처) + 도움말 데이터
    ├── hooks/useTaskListKeyboard.ts # 리스트 j/k/Enter/Space/e/0-3
    └── components/
        ├── Sidebar.tsx           # 데스크/스마트뷰 전환 + 검색 + 테마
        ├── MainArea.tsx          # 데스크 헤더 + 작업/달력/목표 + 스마트뷰 라우팅
        ├── CategoryPanel.tsx     # 카테고리 트리 (1단계 중첩, DnD 정렬)
        ├── TaskPanel.tsx         # 리스트/칸반 + 카테고리 패널
        ├── TaskRow.tsx           # 리스트/스마트뷰 공용 행 (선택·인라인 편집)
        ├── ListView.tsx          # 리스트 (DnD 정렬 + 키보드)
        ├── KanbanView.tsx        # 칸반 (DnD 컬럼 내·간)
        ├── SmartView.tsx         # 오늘/이번 주 cross-workspace
        ├── TaskInlineEditor.tsx  # 인라인 확장 상세 편집기
        ├── CalendarView.tsx      # 오프라인 월간 달력
        ├── GoalsView.tsx         # 목표 + 진행률
        ├── CommandPalette.tsx    # ⌘P 검색/이동 팔레트
        └── HelpOverlay.tsx       # ? 단축키 도움말
```

### 보안 원칙
- 모든 DB 접근은 **메인 프로세스**에서만. 렌더러는 `contextBridge`로 노출된 `window.api`만 호출합니다.
- `nodeIntegration: false`, `contextIsolation: true`, CSP 적용.

### 데이터
- 모든 테이블에 `created_at` / `updated_at` / `deleted_at`(soft delete) 보유 (추후 동기화 대비).
- 기본 조회는 `deleted_at IS NULL`만 반환.
- ID는 전부 UUID(`crypto.randomUUID`).
- DB 파일 위치: `app.getPath('userData')/aop-note.db` (macOS: `~/Library/Application Support/aop-note/`).
- 첫 실행 시 마이그레이션 자동 실행. **예시(시드) 데이터 없이 빈 상태로 시작**합니다.
- 엔티티: 데스크(workspaces) · 카테고리(categories) · 작업(tasks) · 목표(goals). 작업은 `goal_id`로 목표에 연결되며, 목표 진행률은 연결된 작업의 완료 비율로 계산됩니다.

## 시작하기

### 요구 사항
- Node.js 18+ (개발: Node 22 권장)

### 설치
```bash
npm install
```
> `postinstall`에서 `electron-builder install-app-deps`가 better-sqlite3를 현재 Electron ABI에 맞게 자동 리빌드합니다.

### 개발 실행 (HMR)
```bash
npm run dev
```

### 타입 체크
```bash
npm run typecheck
```

### 프로덕션 빌드 (번들만)
```bash
npm run build
```

### 미리보기 (빌드된 앱 실행)
```bash
npm run start
```

### 배포 패키지 생성
```bash
npm run package        # 현재 OS용
npm run package:mac    # macOS dmg
```
결과물은 `dist/`에 생성됩니다.

## 주요 UX

- **퀵 캡처**: 어느 화면에서든 `⌘/Ctrl + N` → 제목만 입력해도 저장. 카테고리·목표 연결 선택 가능. 카테고리 미지정 시 현재 활성 카테고리(없으면 첫 카테고리)로 들어갑니다.
- **인라인 편집**: 작업/목표를 클릭하면 그 자리에서 펼쳐져(별도 화면·드로어 없음) 제목·메모(Markdown)·상태·우선순위·기한·카테고리·목표를 즉시 편집. 선택값은 즉시 저장됩니다.
- **리스트 뷰**: 우선순위·기한 정렬, 체크박스로 완료 토글.
- **칸반 뷰**: `todo / doing / done` 3컬럼, 드래그로 상태 변경 + 정렬 갱신.
- **달력**: 월간 그리드에서 마감일 기준으로 작업 표시. **날짜를 클릭하면 그 날짜로 일정(작업)을 바로 추가**(구글 캘린더식)하고, 추가된 작업은 달력에 표시됩니다. 작업 칩 클릭 시 해당 카테고리로 이동해 펼쳐 편집.
- **목표**: 진행률 바 + 완료 작업 수. 목표 완료 토글, 인라인 편집(설명·기한).
- 색상 코딩과 임박 기한 강조로 가시성 우선.

## 단축키

| 범위 | 키 | 동작 |
| --- | --- | --- |
| 전역 | `⌘/Ctrl + N` | 퀵 캡처 (빠른 작업 추가) |
| 전역 | `⌘/Ctrl + P` | 빠른 이동 / 검색 팔레트 |
| 전역 | `?` | 단축키 도움말 |
| 전역 | `Esc` | 열린 패널/모달 닫기 |
| 리스트 | `J` / `K` | 아래 / 위 작업으로 이동 |
| 리스트 | `Enter` | 상세 편집 열기 (스마트 뷰: 해당 작업으로 이동) |
| 리스트 | `Space` / `X` | 완료 토글 |
| 리스트 | `E` | 제목 인라인 편집 |
| 리스트 | `1` / `2` / `3` | 우선순위 낮음 / 보통 / 높음 |
| 리스트 | `0` | 우선순위 해제 |

> 입력창(input/textarea/select)에 포커스가 있을 때 리스트 단축키와 `?`는 비활성화됩니다. (`⌘/Ctrl` 조합은 동작)

## 범위 밖 (미구현)
- 클라우드 동기화 / 로그인 / 협업·공유
- **외부** 캘린더 연동(Google 등) — 오프라인 인앱 달력만 제공
- 모바일

## 데이터 초기화
모든 데이터를 지우고 빈 상태로 다시 시작하려면 DB 파일을 삭제 후 재실행하세요:
```bash
rm -rf "$HOME/Library/Application Support/aop-note"
```
