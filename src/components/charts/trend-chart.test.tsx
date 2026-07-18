// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TrendChart } from './trend-chart'

afterEach(cleanup)

const LABELS = ['1차', '2차', '3차']
const HIGHLIGHT = [
  { sessionIndex: 0, value: 0.4 },
  { sessionIndex: 2, value: 0.8 },
]
const BACKGROUND = [
  [
    { sessionIndex: 0, value: 0.2 },
    { sessionIndex: 1, value: 0.3 },
  ],
  [{ sessionIndex: 1, value: 0.9 }],
]

describe('TrendChart', () => {
  it('배경 라인(primary-soft 1.6px)이 본인 라인(primary 3.2px)보다 먼저(아래에) 그려진다 (§07)', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={HIGHLIGHT} background={BACKGROUND} />,
    )
    const polylines = [...container.querySelectorAll('polyline')]
    expect(polylines).toHaveLength(3)
    expect(polylines[0].getAttribute('class')).toContain('stroke-primary-soft')
    expect(polylines[0]).toHaveAttribute('stroke-width', '1.6')
    const own = polylines[2]
    expect(own.getAttribute('class')).toContain('stroke-primary')
    expect(own.getAttribute('class')).not.toContain('stroke-primary-soft')
    expect(own).toHaveAttribute('stroke-width', '3.2')
  })

  it('본인 도트는 r=3.6, 기록 회차 수만큼', () => {
    const { container } = render(<TrendChart sessionLabels={LABELS} highlight={HIGHLIGHT} />)
    const dots = container.querySelectorAll('circle')
    expect(dots).toHaveLength(2)
    expect(dots[0]).toHaveAttribute('r', '3.6')
    expect(dots[0].getAttribute('class')).toContain('fill-primary')
  })

  it('목표선은 good 1.5px 점선(4 4)', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={HIGHLIGHT} goal={0.7} />,
    )
    const goalLine = container.querySelector('line')
    expect(goalLine).toHaveAttribute('stroke-dasharray', '4 4')
    expect(goalLine).toHaveAttribute('stroke-width', '1.5')
    expect(goalLine?.getAttribute('class')).toContain('stroke-good')
  })

  it('goal 없으면 목표선 없음', () => {
    const { container } = render(<TrendChart sessionLabels={LABELS} highlight={HIGHLIGHT} />)
    expect(container.querySelector('line')).toBeNull()
  })

  it('x축에 회차 라벨 렌더', () => {
    const { container } = render(<TrendChart sessionLabels={LABELS} highlight={HIGHLIGHT} />)
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toEqual(['1차', '2차', '3차'])
  })

  it('접근성 라벨', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={HIGHLIGHT} label="셔틀런 추이" />,
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', '셔틀런 추이')
  })

  it('회차가 없으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<TrendChart sessionLabels={[]} highlight={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
