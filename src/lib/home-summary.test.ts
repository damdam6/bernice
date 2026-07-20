import { describe, expect, it } from 'vitest'
import type { EventAchievementRate, EventDefinition, Session } from '../../shared/domain'
import { averageAchievementPct, buildHomeGauges, latestSessionOrdinal } from './home-summary'

function session(date: string): Session {
  return { date, entries: [] }
}

function rate(event: string, achievedCount: number, eligibleCount: number, r: number): EventAchievementRate {
  return { event, achievedCount, eligibleCount, rate: r }
}

function event(key: string): EventDefinition {
  return { key, valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' }
}

describe('latestSessionOrdinal', () => {
  const sessions = [session('2026-06-01'), session('2026-06-08'), session('2026-06-15')]

  it('날짜 오름차순 index+1로 n차를 매긴다 (Rankings와 동일 규칙)', () => {
    expect(latestSessionOrdinal(sessions, '2026-06-15')).toBe(3)
    expect(latestSessionOrdinal(sessions, '2026-06-01')).toBe(1)
  })

  it('없는 날짜는 방어값 0', () => {
    expect(latestSessionOrdinal(sessions, '2099-01-01')).toBe(0)
    expect(latestSessionOrdinal([], '2026-06-15')).toBe(0)
  })
})

describe('averageAchievementPct', () => {
  it('rate 단순 평균 ×100 반올림', () => {
    expect(averageAchievementPct([rate('a', 3, 6, 0.5), rate('b', 6, 6, 1)])).toBe(75)
    expect(averageAchievementPct([rate('a', 1, 3, 1 / 3)])).toBe(33)
    expect(averageAchievementPct([rate('a', 2, 3, 2 / 3)])).toBe(67)
  })

  it('빈 배열이면 0 (NaN 방지)', () => {
    expect(averageAchievementPct([])).toBe(0)
  })
})

describe('buildHomeGauges', () => {
  it('achievementRates 순서대로, 라벨은 events[]에서 조회하고 카운트/rate를 보존한다', () => {
    const rates = [rate('셔틀런', 6, 6, 1), rate('골밑슛', 3, 6, 0.5)]
    const events = [event('골밑슛'), event('셔틀런')]

    const gauges = buildHomeGauges(rates, events)

    expect(gauges).toEqual([
      { event: '셔틀런', label: '셔틀런', achievedCount: 6, eligibleCount: 6, rate: 1 },
      { event: '골밑슛', label: '골밑슛', achievedCount: 3, eligibleCount: 6, rate: 0.5 },
    ])
  })

  it('events[]에 없는 종목은 event key를 라벨로 fallback', () => {
    const gauges = buildHomeGauges([rate('미상', 0, 0, 0)], [])
    expect(gauges[0].label).toBe('미상')
  })
})
