import { describe, expect, it } from 'vitest'
import { computeHomeSummary } from './compute-home-summary'
import { computeSessionRankings } from './compute-rankings'
import type { EventDefinition, EventScore, Player, Session, SessionEntry } from '../../shared/domain'

function recorded(value: number, display = String(value)): EventScore {
  return { status: 'recorded', value, display }
}
function exempt(): EventScore {
  return { status: 'exempt', value: null, display: null }
}
function unmeasured(): EventScore {
  return { status: 'unmeasured', value: null, display: null }
}

function player(id: number, status: Player['status'], name = `선수${id}`): Player {
  return { id, name, status }
}

function entry(playerId: number, scores: Record<string, EventScore>, name = `선수${playerId}`): SessionEntry {
  const participated = Object.values(scores).some((score) => score.status !== 'unmeasured')
  return { playerId, name, scores, participated }
}

function event(overrides: Partial<EventDefinition> & Pick<EventDefinition, 'key' | 'direction' | 'targetValue'>): EventDefinition {
  return { valueKind: 'count', target: String(overrides.targetValue), maxScore: null, ...overrides }
}

function session(date: string, entries: SessionEntry[]): Session {
  return { date, entries }
}

describe('computeHomeSummary', () => {
  it('회차가 하나도 없으면 latestSession null · achievementRates 빈 배열', () => {
    const result = computeHomeSummary([], [], [player(1, '활동')])

    expect(result).toEqual({ latestSession: null, achievementRates: [] })
  })

  it('participantCount는 활동 상태 + participated:true만 집계 (비대상·휴식·미참여 제외)', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동'), player(2, '휴식'), player(3, '활동')]
    const s = session('2025-05-16', [
      entry(1, { 골밑슛: recorded(6) }),
      entry(2, { 골밑슛: recorded(7) }), // 휴식 — 기록 있어도 참여 인원에서 제외
      entry(3, { 골밑슛: unmeasured() }), // 활동이지만 미참여
    ])
    const rankings = computeSessionRankings(s, [layup], players)

    const result = computeHomeSummary([s], [rankings], players)

    expect(result.latestSession).toEqual({ date: '2025-05-16', participantCount: 1 })
  })

  it('achievementRates는 최신 회차 EventRanking을 그대로 집계 (활동+recorded만 분모)', () => {
    const shuttleRun = event({ key: '셔틀런', direction: '낮을수록', targetValue: 77 })
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동'), player(2, '활동')]
    const s = session('2025-05-16', [
      entry(1, { 셔틀런: recorded(70, '1:10'), 골밑슛: recorded(6) }),
      entry(2, { 셔틀런: recorded(80, '1:20'), 골밑슛: exempt() }),
    ])
    const rankings = computeSessionRankings(s, [shuttleRun, layup], players)

    const result = computeHomeSummary([s], [rankings], players)

    expect(result.achievementRates).toEqual([
      { event: '셔틀런', achievedCount: 1, eligibleCount: 2, rate: 0.5 },
      { event: '골밑슛', achievedCount: 1, eligibleCount: 1, rate: 1 },
    ])
  })

  it('eligibleCount가 0이면(예: 전원 면제) rate는 0', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동')]
    const s = session('2025-05-16', [entry(1, { 골밑슛: exempt() })])
    const rankings = computeSessionRankings(s, [layup], players)

    const result = computeHomeSummary([s], [rankings], players)

    expect(result.achievementRates).toEqual([{ event: '골밑슛', achievedCount: 0, eligibleCount: 0, rate: 0 }])
  })

  it('여러 회차 중 마지막(sessions.at(-1)) 회차만 집계', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동')]
    const s1 = session('2025-05-01', [entry(1, { 골밑슛: recorded(3) })])
    const s2 = session('2025-05-16', [entry(1, { 골밑슛: recorded(9) })])
    const rankings1 = computeSessionRankings(s1, [layup], players)
    const rankings2 = computeSessionRankings(s2, [layup], players)

    const result = computeHomeSummary([s1, s2], [rankings1, rankings2], players)

    expect(result.latestSession).toEqual({ date: '2025-05-16', participantCount: 1 })
    expect(result.achievementRates).toEqual([{ event: '골밑슛', achievedCount: 1, eligibleCount: 1, rate: 1 }])
  })
})
