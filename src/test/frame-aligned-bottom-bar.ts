import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'

// 하단 고정 바 프레임 정렬 가드(#156) — 화면이 버튼을 BottomActionBar(3층 구조) 안에
// 실제로 넣었는지 조상 체인으로 검증한다. 구조 자체의 상세 검증은 BottomActionBar.test.tsx가
// 정본이고, 페이지 테스트는 이 헬퍼 한 줄로 "전폭 셸로의 회귀"만 막는다.
export function expectFrameAlignedBottomBar(button: HTMLElement) {
  const frame = button.parentElement?.parentElement
  expect(frame).toHaveClass('mx-auto', 'w-full', 'max-w-frame')
  expect(frame?.parentElement).toHaveClass('fixed', 'inset-x-0', 'bottom-0')
}
