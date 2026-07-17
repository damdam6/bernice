import { describe, expect, it } from 'vitest'
import { GAUGE_CIRCUMFERENCE, clampGaugeValue, getGaugeDashArray } from './gauge-math'

describe('clampGaugeValue', () => {
  it('0~100 범위 안의 값은 그대로 반환', () => {
    expect(clampGaugeValue(0)).toBe(0)
    expect(clampGaugeValue(50)).toBe(50)
    expect(clampGaugeValue(100)).toBe(100)
  })

  it('범위 밖 값은 0~100으로 클램프', () => {
    expect(clampGaugeValue(-10)).toBe(0)
    expect(clampGaugeValue(150)).toBe(100)
  })

  it('NaN은 0으로 처리', () => {
    expect(clampGaugeValue(NaN)).toBe(0)
  })
})

describe('getGaugeDashArray', () => {
  it('0%는 채움 길이 0', () => {
    const [filled] = getGaugeDashArray(0).split(' ').map(Number)
    expect(filled).toBe(0)
  })

  it('50%는 원둘레의 절반만큼 채움', () => {
    const [filled] = getGaugeDashArray(50).split(' ').map(Number)
    expect(filled).toBeCloseTo(GAUGE_CIRCUMFERENCE / 2, 5)
  })

  it('100%는 원둘레 전체를 채움 (나머지 길이 0)', () => {
    const [filled, remainder] = getGaugeDashArray(100).split(' ').map(Number)
    expect(filled).toBeCloseTo(GAUGE_CIRCUMFERENCE, 5)
    expect(remainder).toBeCloseTo(0, 5)
  })

  it('범위 밖 값도 클램프 후 계산 (-10 → 0%, 150 → 100%)', () => {
    expect(getGaugeDashArray(-10)).toBe(getGaugeDashArray(0))
    expect(getGaugeDashArray(150)).toBe(getGaugeDashArray(100))
  })
})
