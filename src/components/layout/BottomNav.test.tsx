// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from './BottomNav'

afterEach(cleanup)

const TAB_LABELS = ['홈', '랭킹', '개인'] as const

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it.each([
    ['/', '홈'],
    ['/rankings', '랭킹'],
    ['/players', '개인'],
  ] as const)('%s 경로에서는 %s 탭만 활성화된다', (path, activeLabel) => {
    renderAt(path)

    for (const label of TAB_LABELS) {
      const link = screen.getByRole('link', { name: label })
      if (label === activeLabel) {
        expect(link).toHaveAttribute('aria-current', 'page')
      } else {
        expect(link).not.toHaveAttribute('aria-current')
      }
    }
  })

  it('바가 전폭이 아니라 프레임 폭에 중앙정렬된다(#107)', () => {
    renderAt('/')

    const nav = screen.getByRole('navigation')
    // 바 자체는 위치/폭을 갖지 않는다 — fixed·전폭 클래스가 바에 남아 있으면 안 된다.
    expect(nav).not.toHaveClass('fixed', 'inset-x-0')

    // 바를 감싼 MobileFrame이 프레임 폭 중앙정렬을 담당한다.
    const frame = nav.parentElement
    expect(frame).toHaveClass('mx-auto', 'w-full', 'max-w-frame')

    // 그 바깥이 뷰포트에 고정되는 투명 위치 셸이다.
    expect(frame?.parentElement).toHaveClass('fixed', 'inset-x-0', 'bottom-0')
  })
})
