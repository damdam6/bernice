// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BottomActionBar } from './BottomActionBar'

afterEach(cleanup)

function renderBar() {
  render(
    <BottomActionBar>
      <button type="button">저장</button>
    </BottomActionBar>,
  )
  return screen.getByRole('button', { name: '저장' })
}

describe('BottomActionBar', () => {
  it('children을 바 내용물로 렌더한다', () => {
    expect(renderBar()).toBeInTheDocument()
  })

  it('바가 전폭이 아니라 프레임 폭에 중앙정렬된다(#156)', () => {
    const button = renderBar()

    // 바 자체(그라데이션·패딩 레이어)는 위치/폭을 갖지 않는다 — fixed·전폭 클래스 금지.
    const bar = button.parentElement
    expect(bar).toHaveClass('bg-gradient-to-t', 'from-canvas', 'via-canvas', 'px-4')
    expect(bar).not.toHaveClass('fixed', 'inset-x-0')

    // 바를 감싼 MobileFrame이 프레임 폭 중앙정렬을 담당한다.
    const frame = bar?.parentElement
    expect(frame).toHaveClass('mx-auto', 'w-full', 'max-w-frame')

    // 그 바깥이 뷰포트에 고정되는 투명 위치 셸이다.
    expect(frame?.parentElement).toHaveClass('fixed', 'inset-x-0', 'bottom-0')
  })
})
