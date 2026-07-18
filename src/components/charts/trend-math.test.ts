import { describe, expect, it } from 'vitest'
import type { TrendLayout } from './trend-math'
import { polylinePoints, trendX, trendY } from './trend-math'

const LAYOUT: TrendLayout = { width: 320, height: 160, padX: 20, padTop: 10, padBottom: 30 }

describe('trendX', () => {
  it('첫 회차는 좌측 패딩, 마지막 회차는 우측 패딩, 중간은 등간격', () => {
    expect(trendX(0, 3, LAYOUT)).toBe(20)
    expect(trendX(1, 3, LAYOUT)).toBe(160)
    expect(trendX(2, 3, LAYOUT)).toBe(300)
  })

  it('회차가 1개면 중앙 (0 나누기 방어)', () => {
    expect(trendX(0, 1, LAYOUT)).toBe(160)
  })
})

describe('trendY', () => {
  it('1(좋음)은 상단, 0(나쁨)은 하단, 0.5는 중간', () => {
    expect(trendY(1, LAYOUT)).toBe(10)
    expect(trendY(0, LAYOUT)).toBe(130)
    expect(trendY(0.5, LAYOUT)).toBe(70)
  })

  it('범위 밖 값은 클램프', () => {
    expect(trendY(1.4, LAYOUT)).toBe(10)
    expect(trendY(-0.2, LAYOUT)).toBe(130)
  })
})

describe('polylinePoints', () => {
  it('희소 시리즈 — 미기록 회차는 건너뛰고 있는 점끼리 잇는다', () => {
    const points = [
      { sessionIndex: 0, value: 0 },
      { sessionIndex: 2, value: 1 },
    ]
    expect(polylinePoints(points, 3, LAYOUT)).toBe('20,130 300,10')
  })

  it('라벨 범위 밖 인덱스는 방어적으로 버린다', () => {
    const points = [
      { sessionIndex: -1, value: 0.5 },
      { sessionIndex: 1, value: 0.5 },
      { sessionIndex: 9, value: 0.5 },
    ]
    expect(polylinePoints(points, 3, LAYOUT)).toBe('160,70')
  })

  it('빈 시리즈는 빈 문자열', () => {
    expect(polylinePoints([], 3, LAYOUT)).toBe('')
  })
})
