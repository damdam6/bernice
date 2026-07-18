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
})
