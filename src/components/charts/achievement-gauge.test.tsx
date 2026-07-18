// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AchievementGauge } from './achievement-gauge'

afterEach(cleanup)

function fill(container: HTMLElement): HTMLElement {
  return container.querySelector('[role="img"] > div') as HTMLElement
}

describe('AchievementGauge', () => {
  it('달성률만큼 width % 채움 + .5s width 트랜지션 (§07)', () => {
    const { container } = render(<AchievementGauge value={0.6} />)
    const bar = fill(container)
    expect(bar.style.width).toBe('60%')
    expect(bar.getAttribute('class')).toContain('transition-[width]')
    expect(bar.getAttribute('class')).toContain('duration-500')
  })

  it('전원 달성(1.0)은 primary, 미만은 primary-soft', () => {
    const { container: done } = render(<AchievementGauge value={1} />)
    expect(fill(done).className.split(' ')).toContain('bg-primary')
    cleanup()
    const { container: partial } = render(<AchievementGauge value={0.99} />)
    expect(fill(partial).className.split(' ')).toContain('bg-primary-soft')
  })

  it('범위 밖 값·NaN은 클램프', () => {
    const { container } = render(<AchievementGauge value={1.4} />)
    expect(fill(container).style.width).toBe('100%')
    cleanup()
    const { container: nan } = render(<AchievementGauge value={Number.NaN} />)
    expect(fill(nan).style.width).toBe('0%')
  })

  it('접근성 — 달성률을 %로 읽어준다', () => {
    render(<AchievementGauge value={0.75} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '달성률 75%')
  })
})
