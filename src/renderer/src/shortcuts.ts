// Central registry of keyboard shortcuts — the single source of truth for both
// the handlers (App / useListKeyboard) and the "?" help overlay.

export interface ShortcutDef {
  keys: string
  desc: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutDef[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '전역',
    items: [
      { keys: '⌘/Ctrl + N', desc: '퀵 캡처 (빠른 작업 추가)' },
      { keys: '⌘/Ctrl + ⇧ + Space', desc: '다른 앱을 쓰는 중에도 퀵 캡처' },
      { keys: '⌘/Ctrl + P', desc: '빠른 이동 / 검색 팔레트' },
      { keys: '⌘/Ctrl + \\', desc: '사이드바 접기 / 펼치기' },
      { keys: '⌘/Ctrl + Z', desc: '실행 취소 — 이동·상태·이름·색 변경 (글 입력 중엔 에디터 자체 실행 취소)' },
      { keys: '?', desc: '단축키 도움말 열기' },
      { keys: 'Esc', desc: '열린 패널/모달 닫기' }
    ]
  },
  {
    title: '데스크 (사이드바의 ⋮⋮ 손잡이에 포커스)',
    items: [
      { keys: 'Alt + ↑ / ↓', desc: '같은 단계에서 순서 바꾸기' },
      { keys: 'Alt + →', desc: '바로 위 데스크의 하위로 넣기' },
      { keys: 'Alt + ←', desc: '한 단계 밖으로 꺼내기' }
    ]
  },
  {
    title: '작업 리스트',
    items: [
      { keys: 'J / K', desc: '아래 / 위 작업으로 이동' },
      { keys: 'Enter', desc: '선택한 작업 상세 편집 열기 (스마트 뷰: 해당 작업으로 이동)' },
      { keys: 'Space / X', desc: '완료(done) 토글' },
      { keys: 'E', desc: '제목 인라인 편집' },
      { keys: '1 / 2 / 3', desc: '우선순위 낮음 / 보통 / 높음' },
      { keys: '0', desc: '우선순위 해제' }
    ]
  }
]

/** True when focus is in a text field — shortcuts must yield to typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}
