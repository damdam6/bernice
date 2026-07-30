import { describe, expect, it } from 'vitest'
import type { TrendDomain, TrendLayout } from './trend-math'
import { polylinePoints, trendDomain, trendX, trendY } from './trend-math'

const LAYOUT: TrendLayout = { width: 320, height: 160, padX: 20, padTop: 10, padBottom: 30 }
// 밴드: y = 10(상단) … 130(하단), 높이 120
const DOMAIN: TrendDomain = { min: 0, max: 100 }

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

describe('trendDomain', () => {
  it('본인 점 min~max에 패딩 — 범위가 점들을 감싼다', () => {
    const domain = trendDomain([
      { sessionIndex: 0, value: 60 },
      { sessionIndex: 1, value: 100 },
    ])
    expect(domain.min).toBeCloseTo(56.8)
    expect(domain.max).toBeCloseTo(103.2)
  })

  it('목표값을 항상 포함한다 — 본인 범위 밖 목표면 그쪽으로 범위가 늘어난다 (목표선이 늘 보임)', () => {
    const highlight = [
      { sessionIndex: 0, value: 76 },
      { sessionIndex: 1, value: 90 },
    ]
    const below = trendDomain(highlight, 60)
    expect(below.min).toBeLessThan(60)
    expect(below.max).toBeGreaterThan(90)

    const above = trendDomain(highlight, 200)
    expect(above.min).toBeLessThan(76)
    expect(above.max).toBeGreaterThan(200)
  })

  it('팀 배경 라인은 범위 계산에서 제외된다 — 타인의 극단값이 본인 축을 흔들지 않는다', () => {
    const highlight = [
      { sessionIndex: 0, value: 76 },
      { sessionIndex: 1, value: 90 },
    ]
    const background = [
      [
        { sessionIndex: 0, value: 802 }, // 13:22 오입력 같은 극단값
        { sessionIndex: 1, value: 40 },
      ],
    ]
    expect(trendDomain(highlight, 77, background)).toEqual(trendDomain(highlight, 77))
  })

  it('본인 점이 1개면 값 기준 폴백 패딩으로 중앙 배치', () => {
    const domain = trendDomain([{ sessionIndex: 0, value: 80 }])
    expect(domain).toEqual({ min: 72, max: 88 })
    expect(trendY(80, domain, LAYOUT)).toBe(70) // 밴드 중앙
  })

  it('본인 점이 전부 동률이고 목표까지 같은 값이면(min == max) 중앙 배치 폴백', () => {
    const domain = trendDomain(
      [
        { sessionIndex: 0, value: 5 },
        { sessionIndex: 1, value: 5 },
      ],
      5,
    )
    expect(domain.min).toBeLessThan(5)
    expect(domain.max).toBeGreaterThan(5)
    expect(trendY(5, domain, LAYOUT)).toBe(70)
  })

  it('값이 0으로 동률이어도 폭이 0이 되지 않는다 (최소 폴백 반경 1)', () => {
    expect(trendDomain([{ sessionIndex: 0, value: 0 }])).toEqual({ min: -1, max: 1 })
  })

  it('본인 점도 목표도 없으면 배경 extent로 폴백 — 차트가 통째로 비지 않게', () => {
    const domain = trendDomain([], undefined, [
      [
        { sessionIndex: 0, value: 40 },
        { sessionIndex: 1, value: 90 },
      ],
    ])
    expect(domain.min).toBeCloseTo(36)
    expect(domain.max).toBeCloseTo(94)
  })

  it('아무 값도 없으면 0~1', () => {
    expect(trendDomain([])).toEqual({ min: 0, max: 1 })
  })

  it('비정상 값(NaN·Infinity)은 범위 계산에서 걸러낸다', () => {
    const domain = trendDomain(
      [
        { sessionIndex: 0, value: Number.NaN },
        { sessionIndex: 1, value: 60 },
        { sessionIndex: 2, value: 100 },
      ],
      Number.POSITIVE_INFINITY,
    )
    expect(domain.min).toBeCloseTo(56.8)
    expect(domain.max).toBeCloseTo(103.2)
  })
})

describe('trendY', () => {
  it('원값 축 — domain.max가 상단, min이 하단, 중간값은 선형 보간 (축 반전 없음)', () => {
    expect(trendY(100, DOMAIN, LAYOUT)).toBe(10)
    expect(trendY(0, DOMAIN, LAYOUT)).toBe(130)
    expect(trendY(50, DOMAIN, LAYOUT)).toBe(70)
  })

  it('"높을수록" 종목은 개선 시 y가 작아지고(상승), "낮을수록" 종목은 개선 시 y가 커진다(하강)', () => {
    // 개수 종목 6 → 8개 (개선 = 증가)
    const counts: TrendDomain = { min: 5, max: 10 }
    expect(trendY(8, counts, LAYOUT)).toBeLessThan(trendY(6, counts, LAYOUT))
    // 시간 종목 90 → 76초 (개선 = 감소)
    const seconds: TrendDomain = { min: 70, max: 95 }
    expect(trendY(76, seconds, LAYOUT)).toBeGreaterThan(trendY(90, seconds, LAYOUT))
  })

  it('범위 밖 값은 클램프하지 않고 밴드 밖 좌표를 낸다 (클립이 잘라내는 몫)', () => {
    expect(trendY(120, DOMAIN, LAYOUT)).toBeLessThan(LAYOUT.padTop)
    expect(trendY(-20, DOMAIN, LAYOUT)).toBeGreaterThan(LAYOUT.height - LAYOUT.padBottom)
  })

  it('비정상 값·폭 0 도메인은 방어적으로 중앙', () => {
    expect(trendY(Number.NaN, DOMAIN, LAYOUT)).toBe(70)
    expect(trendY(5, { min: 5, max: 5 }, LAYOUT)).toBe(70)
  })
})

describe('polylinePoints', () => {
  it('희소 시리즈 — 미기록 회차는 건너뛰고 있는 점끼리 잇는다', () => {
    const points = [
      { sessionIndex: 0, value: 0 },
      { sessionIndex: 2, value: 100 },
    ]
    expect(polylinePoints(points, 3, LAYOUT, DOMAIN)).toBe('20,130 300,10')
  })

  it('라벨 범위 밖 인덱스는 방어적으로 버린다', () => {
    const points = [
      { sessionIndex: -1, value: 50 },
      { sessionIndex: 1, value: 50 },
      { sessionIndex: 9, value: 50 },
    ]
    expect(polylinePoints(points, 3, LAYOUT, DOMAIN)).toBe('160,70')
  })

  it('빈 시리즈는 빈 문자열', () => {
    expect(polylinePoints([], 3, LAYOUT, DOMAIN)).toBe('')
  })
})
