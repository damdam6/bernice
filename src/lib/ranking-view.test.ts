import { describe, expect, it } from 'vitest'
import type { EventDefinition, EventRanking, EventScore, PlayerSummary, RankingEntry, Session, SessionEntry } from '../../shared/domain'
import { buildEventGuidance, buildRankingRows, findTiedRanks } from './ranking-view'

// ── 픽스처 헬퍼 (functions/lib/compute-rankings.test.ts와 같은 결) ──────────────

function recorded(value: number, display = String(value)): EventScore {
  return { status: 'recorded', value, display }
}
function exempt(): EventScore {
  return { status: 'exempt', value: null, display: null }
}
function unmeasured(): EventScore {
  return { status: 'unmeasured', value: null, display: null }
}
function invalid(display: string, reason = '이상값'): EventScore {
  return { status: 'invalid', value: null, display, reason }
}

function rankingEntry(overrides: Partial<RankingEntry> & Pick<RankingEntry, 'playerId' | 'rank'>): RankingEntry {
  return { name: `선수${overrides.playerId}`, value: 0, display: '0', achieved: false, ...overrides }
}

function sessionEntry(playerId: number, scores: Record<string, EventScore>, name = `선수${playerId}`): SessionEntry {
  const participated = Object.values(scores).some((score) => score.status !== 'unmeasured')
  return { playerId, name, scores, participated }
}

function player(id: number, status: PlayerSummary['status'], name = `선수${id}`): PlayerSummary {
  return { id, name, status, trends: [], personalBests: [] }
}

const EVENT_KEY = '골밑슛'

describe('buildRankingRows', () => {
  it('순위권 엔트리를 그대로(순서 포함) 유지한다', () => {
    const eventRanking: EventRanking = {
      event: EVENT_KEY,
      entries: [
        rankingEntry({ playerId: 2, rank: 1, value: 8, display: '8', achieved: true }),
        rankingEntry({ playerId: 1, rank: 2, value: 6, display: '6', achieved: true }),
      ],
    }
    const session: Session = {
      date: '2026-07-01',
      entries: [sessionEntry(2, { [EVENT_KEY]: recorded(8) }), sessionEntry(1, { [EVENT_KEY]: recorded(6) })],
    }
    const players = [player(1, '활동'), player(2, '활동')]

    const rows = buildRankingRows(eventRanking, session, EVENT_KEY, players)

    expect(rows).toEqual([
      { status: 'recorded', playerId: 2, name: '선수2', rank: 1, value: 8, display: '8', achieved: true },
      { status: 'recorded', playerId: 1, name: '선수1', rank: 2, value: 6, display: '6', achieved: true },
    ])
  })

  it('활동 상태의 면제·미측정·이상값을 회차 원본 순서로 하단에 보충한다', () => {
    const eventRanking: EventRanking = { event: EVENT_KEY, entries: [rankingEntry({ playerId: 1, rank: 1, achieved: true })] }
    const session: Session = {
      date: '2026-07-01',
      entries: [
        sessionEntry(1, { [EVENT_KEY]: recorded(0) }),
        sessionEntry(2, { [EVENT_KEY]: exempt() }),
        sessionEntry(3, { [EVENT_KEY]: unmeasured() }),
        sessionEntry(4, { [EVENT_KEY]: invalid('열개') }),
      ],
    }
    const players = [player(1, '활동'), player(2, '활동'), player(3, '활동'), player(4, '활동')]

    const rows = buildRankingRows(eventRanking, session, EVENT_KEY, players)

    expect(rows.slice(1)).toEqual([
      { status: 'exempt', playerId: 2, name: '선수2' },
      { status: 'unmeasured', playerId: 3, name: '선수3' },
      { status: 'invalid', playerId: 4, name: '선수4', display: '열개' },
    ])
  })

  it('비대상·휴식 선수는 면제·미측정 상태여도 보충하지 않는다', () => {
    const eventRanking: EventRanking = { event: EVENT_KEY, entries: [] }
    const session: Session = {
      date: '2026-07-01',
      entries: [sessionEntry(1, { [EVENT_KEY]: exempt() }), sessionEntry(2, { [EVENT_KEY]: unmeasured() })],
    }
    const players = [player(1, '비대상'), player(2, '휴식')]

    expect(buildRankingRows(eventRanking, session, EVENT_KEY, players)).toEqual([])
  })

  it('그 회차에 엔트리 자체가 없는 활동 선수는 노출되지 않는다', () => {
    const eventRanking: EventRanking = { event: EVENT_KEY, entries: [] }
    const session: Session = { date: '2026-07-01', entries: [] } // 아직 이 회차 탭에 참가자 행이 없음
    const players = [player(1, '활동')] // 명단엔 있지만 이 회차엔 참가 자체가 없음(가입 이전 등)

    expect(buildRankingRows(eventRanking, session, EVENT_KEY, players)).toEqual([])
  })

  it('이미 순위권에 있는 선수는 보충 목록에 중복으로 나타나지 않는다', () => {
    const eventRanking: EventRanking = { event: EVENT_KEY, entries: [rankingEntry({ playerId: 1, rank: 1, achieved: true })] }
    const session: Session = { date: '2026-07-01', entries: [sessionEntry(1, { [EVENT_KEY]: recorded(0) })] }
    const players = [player(1, '활동')]

    expect(buildRankingRows(eventRanking, session, EVENT_KEY, players)).toHaveLength(1)
  })
})

describe('findTiedRanks', () => {
  it('표준 공동순위(1,1,3) — rank 1이 2회 이상이면 그 rank만 포함', () => {
    const rows = [
      rankingEntry({ playerId: 1, rank: 1 }),
      rankingEntry({ playerId: 2, rank: 1 }),
      rankingEntry({ playerId: 3, rank: 3 }),
    ].map((entry) => ({ status: 'recorded' as const, ...entry }))

    expect(findTiedRanks(rows)).toEqual(new Set([1]))
  })

  it('동순위가 없으면 빈 Set', () => {
    const rows = [rankingEntry({ playerId: 1, rank: 1 }), rankingEntry({ playerId: 2, rank: 2 })].map((entry) => ({
      status: 'recorded' as const,
      ...entry,
    }))

    expect(findTiedRanks(rows)).toEqual(new Set())
  })

  it('exempt·unmeasured·invalid 행은 판정에서 제외된다', () => {
    const rows = [
      { status: 'recorded' as const, ...rankingEntry({ playerId: 1, rank: 1 }) },
      { status: 'exempt' as const, playerId: 2, name: '선수2' },
      { status: 'unmeasured' as const, playerId: 3, name: '선수3' },
      { status: 'invalid' as const, playerId: 4, name: '선수4', display: 'x' },
    ]

    expect(findTiedRanks(rows)).toEqual(new Set())
  })
})

describe('buildEventGuidance', () => {
  function event(overrides: Partial<EventDefinition> & Pick<EventDefinition, 'target' | 'targetValue' | 'direction'>): EventDefinition {
    return { key: '종목', valueKind: 'count', maxScore: null, ...overrides }
  }

  it('개수 + 높을수록 + 만점 있음 — PRD §05 예시와 일치', () => {
    const layup = event({ valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' })

    expect(buildEventGuidance(layup)).toBe('목표 5개 이상 · / 10')
  })

  it('시간 + 낮을수록 + 만점 없음 — PRD §05 예시와 일치', () => {
    const shuttleRun = event({ valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' })

    expect(buildEventGuidance(shuttleRun)).toBe('목표 1:17 이내 · 낮을수록 좋음 ↓')
  })

  it('개수 + 낮을수록 + 만점 없음 — "개" 단위 + 방향 화살표 꼬리말', () => {
    const layup = event({ valueKind: 'count', target: '3', targetValue: 3, maxScore: null, direction: '낮을수록' })

    expect(buildEventGuidance(layup)).toBe('목표 3개 이내 · 낮을수록 좋음 ↓')
  })

  it('시간 + 높을수록 + 만점 없음 — 단위 없이 방향 화살표 꼬리말', () => {
    const hangTime = event({ valueKind: 'time', target: '5', targetValue: 5, maxScore: null, direction: '높을수록' })

    expect(buildEventGuidance(hangTime)).toBe('목표 5 이상 · 높을수록 좋음 ↑')
  })
})
