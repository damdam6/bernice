import { describe, expect, it } from 'vitest'
import { computeGaugePercent, formatGaugeLabel, isGaugeFullyAchieved } from './gauge-math'

describe('computeGaugePercent', () => {
  it('0명 달성이면 0%', () => {
    expect(computeGaugePercent(0, 5)).toBe(0)
  })

  it('중간 달성이면 비율만큼 채움', () => {
    expect(computeGaugePercent(2, 5)).toBeCloseTo(40, 5)
  })

  it('전원 달성이면 100%', () => {
    expect(computeGaugePercent(5, 5)).toBe(100)
  })

  it('eligibleCount가 0 이하면 0%(전원 면제 등)', () => {
    expect(computeGaugePercent(0, 0)).toBe(0)
    expect(computeGaugePercent(3, -1)).toBe(0)
  })

  it('achievedCount가 eligibleCount를 초과해도 100%로 클램프', () => {
    expect(computeGaugePercent(7, 5)).toBe(100)
  })

  it('NaN은 0으로 처리', () => {
    expect(computeGaugePercent(NaN, 5)).toBe(0)
  })
})

describe('isGaugeFullyAchieved', () => {
  it('achievedCount가 eligibleCount 이상이면 전원 달성', () => {
    expect(isGaugeFullyAchieved(5, 5)).toBe(true)
    expect(isGaugeFullyAchieved(7, 5)).toBe(true)
  })

  it('미달이면 false', () => {
    expect(isGaugeFullyAchieved(2, 5)).toBe(false)
  })

  it('eligibleCount가 0 이하면 전원 달성으로 보지 않는다', () => {
    expect(isGaugeFullyAchieved(0, 0)).toBe(false)
  })
})

describe('formatGaugeLabel', () => {
  it('achievedCount/eligibleCount를 "n/m명 달성" 형식으로 포맷', () => {
    expect(formatGaugeLabel(2, 5)).toBe('2/5명 달성')
  })

  it('NaN은 0으로 처리', () => {
    expect(formatGaugeLabel(NaN, 5)).toBe('0/5명 달성')
  })
})
