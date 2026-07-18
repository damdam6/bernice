// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PerformanceBar } from './performance-bar'

afterEach(cleanup)

function fill(container: HTMLElement): HTMLElement {
  return container.querySelector('[role="img"] > div') as HTMLElement
}

describe('PerformanceBar', () => {
  it('정규화 성능만큼 width % 채움', () => {
    const { container } = render(<PerformanceBar value={0.42} achieved={false} />)
    expect(fill(container).style.width).toBe('42%')
  })

  it('달성자는 good, 미달은 perf-muted (§07)', () => {
    const { container: achieved } = render(<PerformanceBar value={0.9} achieved />)
    expect(fill(achieved).getAttribute('class')).toContain('bg-good')
    cleanup()
    const { container: missed } = render(<PerformanceBar value={0.3} achieved={false} />)
    expect(fill(missed).getAttribute('class')).toContain('bg-perf-muted')
  })

  it('범위 밖 값은 클램프', () => {
    const { container } = render(<PerformanceBar value={-0.5} achieved={false} />)
    expect(fill(container).style.width).toBe('0%')
  })

  it('접근성 — 상대 성능을 %로 읽어준다', () => {
    render(<PerformanceBar value={0.42} achieved={false} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '상대 성능 42%')
  })
})
