// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Gauge } from './Gauge'

afterEach(cleanup)

function fillBar() {
  return screen.getByRole('progressbar').firstElementChild as HTMLElement
}

describe('Gauge', () => {
  it('라벨과 달성 인원 텍스트를 렌더한다', () => {
    render(<Gauge achievedCount={2} eligibleCount={5} label="셔틀런" />)

    expect(screen.getByText('셔틀런')).toBeInTheDocument()
    expect(screen.getByText('2/5명 달성')).toBeInTheDocument()
  })

  it('0명 달성이면 width 0%, primary-soft 채움색', () => {
    render(<Gauge achievedCount={0} eligibleCount={5} />)

    const bar = fillBar()
    expect(bar).toHaveStyle({ width: '0%' })
    expect(bar.className).toContain('bg-primary-soft')
  })

  it('중간 달성이면 width가 비율만큼, primary-soft 채움색', () => {
    render(<Gauge achievedCount={2} eligibleCount={5} />)

    const bar = fillBar()
    expect(bar).toHaveStyle({ width: '40%' })
    expect(bar.className).toContain('bg-primary-soft')
  })

  it('전원 달성이면 width 100%, primary 채움색', () => {
    render(<Gauge achievedCount={5} eligibleCount={5} />)

    const bar = fillBar()
    expect(bar).toHaveStyle({ width: '100%' })
    expect(bar.className).toContain('bg-primary')
    expect(bar.className).not.toContain('bg-primary-soft')
  })

  it('eligibleCount가 0이면 width 0%, primary-soft 채움색(전원 달성 아님)', () => {
    render(<Gauge achievedCount={0} eligibleCount={0} />)

    expect(screen.getByText('0/0명 달성')).toBeInTheDocument()
    const bar = fillBar()
    expect(bar).toHaveStyle({ width: '0%' })
    expect(bar.className).toContain('bg-primary-soft')
  })

  it('progressbar 접근성 속성이 퍼센트와 일치한다', () => {
    render(<Gauge achievedCount={2} eligibleCount={5} />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })
})
