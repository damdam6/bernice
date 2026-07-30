// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TrendChart } from './trend-chart'

afterEach(cleanup)

const LABELS = ['1차', '2차', '3차']
// 값은 모두 종목 원값이다(#172) — 개수 종목은 개, 시간 종목은 초.
const COUNT_HIGHLIGHT = [
  { sessionIndex: 0, value: 6 },
  { sessionIndex: 2, value: 8 },
]
const TIME_HIGHLIGHT = [
  { sessionIndex: 0, value: 90 },
  { sessionIndex: 2, value: 76 },
]
const BACKGROUND = [
  // 95초는 본인 범위 위로 벗어나고 88초는 안 — 벗어난 구간만 클립된다
  [
    { sessionIndex: 0, value: 95 },
    { sessionIndex: 1, value: 88 },
  ],
  // 13:22 오입력 같은 극단값 — 도메인과 교차하는 구간이 전혀 없어 렌더에서 빠진다(#174)
  [{ sessionIndex: 1, value: 802 }],
]
const VISIBLE_BACKGROUND_COUNT = 1

// 컴포넌트 레이아웃 상수(padTop 12 · padBottom 26 · 기본 height 160)에서 파생한 플롯 밴드.
const BAND_TOP = 12
const BAND_HEIGHT = 122
const BAND_BOTTOM = BAND_TOP + BAND_HEIGHT

const dotCenters = (container: HTMLElement) =>
  [...container.querySelectorAll('circle')].map((dot) => Number(dot.getAttribute('cy')))

describe('TrendChart', () => {
  it('배경 라인(primary-soft 1.6px)이 본인 라인(primary 3.2px)보다 먼저(아래에) 그려진다 (§07)', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} background={BACKGROUND} />,
    )
    const polylines = [...container.querySelectorAll('polyline')]
    expect(polylines).toHaveLength(VISIBLE_BACKGROUND_COUNT + 1)
    expect(polylines[0].getAttribute('class')).toContain('stroke-primary-soft')
    expect(polylines[0]).toHaveAttribute('stroke-width', '1.6')
    const own = polylines[polylines.length - 1]
    expect(own.getAttribute('class')).toContain('stroke-primary')
    expect(own.getAttribute('class')).not.toContain('stroke-primary-soft')
    expect(own).toHaveAttribute('stroke-width', '3.2')
  })

  it('본인 도트는 r=3.6, 기록 회차 수만큼', () => {
    const { container } = render(<TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} />)
    const dots = container.querySelectorAll('circle')
    expect(dots).toHaveLength(2)
    expect(dots[0]).toHaveAttribute('r', '3.6')
    expect(dots[0].getAttribute('class')).toContain('fill-primary')
  })

  it('"높을수록" 종목은 개선 시 선이 올라간다 — 값이 커지면 y가 작아진다', () => {
    const { container } = render(<TrendChart sessionLabels={LABELS} highlight={COUNT_HIGHLIGHT} />)
    const [first, second] = dotCenters(container) // 6개 → 8개
    expect(second).toBeLessThan(first)
  })

  it('"낮을수록" 종목은 개선 시 선이 내려간다 — 값이 작아지면 y가 커진다 (축 반전 없음)', () => {
    const { container } = render(<TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} />)
    const [first, second] = dotCenters(container) // 1:30(90초) → 1:16(76초)
    expect(second).toBeGreaterThan(first)
  })

  it('두 방향이 같은 코드 경로를 타므로 값 간격이 같으면 y 간격도 같다 (direction 분기 없음)', () => {
    const rising = render(
      <TrendChart
        sessionLabels={LABELS}
        highlight={[
          { sessionIndex: 0, value: 10 },
          { sessionIndex: 2, value: 20 },
        ]}
      />,
    )
    const falling = render(
      <TrendChart
        sessionLabels={LABELS}
        highlight={[
          { sessionIndex: 0, value: 20 },
          { sessionIndex: 2, value: 10 },
        ]}
      />,
    )
    const [riseFirst, riseSecond] = dotCenters(rising.container)
    const [fallFirst, fallSecond] = dotCenters(falling.container)
    expect(riseSecond - riseFirst).toBeCloseTo(fallFirst - fallSecond)
  })

  it('배경 라인은 플롯 밴드로 클립된다 — 본인 축 범위를 벗어난 구간이 잘려 보인다', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} background={BACKGROUND} />,
    )
    const band = container.querySelector('defs rect')
    expect(band).toHaveAttribute('x', '0')
    expect(band).toHaveAttribute('width', '320')
    expect(band).toHaveAttribute('y', String(BAND_TOP))
    expect(band).toHaveAttribute('height', String(BAND_HEIGHT))

    const clipPath = band?.parentElement
    const group = container.querySelector('g[clip-path]')
    expect(clipPath?.id).toBeTruthy()
    expect(group?.getAttribute('clip-path')).toBe(`url(#${clipPath?.id})`)

    // 클립 대상은 배경 라인뿐 — 본인 라인·도트·회차 라벨은 밴드 경계에서 잘리지 않는다
    const clipped = [...(group?.querySelectorAll('polyline') ?? [])]
    expect(clipped).toHaveLength(VISIBLE_BACKGROUND_COUNT)
    for (const line of clipped) expect(line.getAttribute('class')).toContain('stroke-primary-soft')
    expect(group?.querySelectorAll('circle, text')).toHaveLength(0)
  })

  it('배경 라인 좌표는 클램프되지 않는다 — 가시 시리즈의 범위 밖 점은 밴드 밖 좌표로 남는다', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} background={BACKGROUND} />,
    )
    // 95초 → 88초 시리즈: 88초는 도메인 안이라 렌더되고, 95초 점은 밴드 위로 벗어난 채 남는다
    const visible = container.querySelector('g[clip-path] polyline')
    const firstY = Number(visible?.getAttribute('points')?.split(' ')[0].split(',')[1])
    expect(firstY).toBeLessThan(BAND_TOP)
  })

  it('도메인과 교차하는 구간이 없는 배경 시리즈는 렌더되지 않는다 — 세로 막대 아티팩트 (#174)', () => {
    // 재현 조건: 본인 1:15(75초) 1점 + 목표 1:17(77초), 팀원은 1:30~1:50로 전부 도메인 밖
    const { container } = render(
      <TrendChart
        sessionLabels={LABELS}
        highlight={[{ sessionIndex: 0, value: 75 }]}
        goal={77}
        background={[
          [
            { sessionIndex: 0, value: 90 },
            { sessionIndex: 1, value: 95 },
          ],
          [{ sessionIndex: 0, value: 110 }],
        ]}
      />,
    )
    expect(container.querySelectorAll('g[clip-path] polyline')).toHaveLength(0)
    // 본인 도트와 목표선은 그대로 남는다
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.querySelector('line')).not.toBeNull()
  })

  it('본인 1점 + 목표는 최소 도메인 폭 덕에 절벽처럼 벌어지지 않는다 (#174)', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={[{ sessionIndex: 0, value: 75 }]} goal={77} />,
    )
    const [dotY] = dotCenters(container)
    const goalY = Number(container.querySelector('line')?.getAttribute('y1'))
    for (const y of [dotY, goalY]) {
      expect(y).toBeGreaterThan(BAND_TOP)
      expect(y).toBeLessThan(BAND_BOTTOM)
    }
    // 2초 차이가 밴드를 가로지르지 않는다 — 값 차이만큼만 벌어진다
    expect(Math.abs(dotY - goalY)).toBeLessThan(BAND_HEIGHT * 0.2)
  })

  it('본인 기록이 0건이면 차트 대신 빈 상태 문구 — 빈 좌표축을 그리지 않는다 (#174)', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={[]} goal={77} background={BACKGROUND} />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('아직 기록이 없습니다')).toBeInTheDocument()
  })

  it('라벨 범위 밖 점만 있으면 그릴 게 없으므로 빈 상태 문구 (#174)', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={[{ sessionIndex: 9, value: 80 }]} />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('아직 기록이 없습니다')).toBeInTheDocument()
  })

  it('목표선은 good 1.5px 점선(4 4)', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} goal={77} />,
    )
    const goalLine = container.querySelector('line')
    expect(goalLine).toHaveAttribute('stroke-dasharray', '4 4')
    expect(goalLine).toHaveAttribute('stroke-width', '1.5')
    expect(goalLine?.getAttribute('class')).toContain('stroke-good')
  })

  it('목표가 본인 기록 범위 밖이어도 목표선은 항상 밴드 안에 보인다', () => {
    for (const goal of [5, 500]) {
      const { container } = render(
        <TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} goal={goal} />,
      )
      const y = Number(container.querySelector('line')?.getAttribute('y1'))
      expect(y).toBeGreaterThanOrEqual(BAND_TOP)
      expect(y).toBeLessThanOrEqual(BAND_BOTTOM)
      cleanup()
    }
  })

  it('goal 없으면 목표선 없음', () => {
    const { container } = render(<TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} />)
    expect(container.querySelector('line')).toBeNull()
  })

  it('본인 기록이 1개뿐이거나 목표와 동률이면(min == max) 중앙 배치 폴백', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={[{ sessionIndex: 0, value: 5 }]} goal={5} />,
    )
    const center = BAND_TOP + BAND_HEIGHT / 2
    expect(dotCenters(container)).toEqual([center])
    expect(Number(container.querySelector('line')?.getAttribute('y1'))).toBe(center)
  })

  it('x축에 회차 라벨만 렌더 — 축 눈금·값 라벨은 없다', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} goal={77} background={BACKGROUND} />,
    )
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toEqual(['1차', '2차', '3차'])
  })

  it('접근성 라벨', () => {
    const { container } = render(
      <TrendChart sessionLabels={LABELS} highlight={TIME_HIGHLIGHT} label="셔틀런 추이" />,
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', '셔틀런 추이')
  })

  it('회차가 없으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<TrendChart sessionLabels={[]} highlight={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
