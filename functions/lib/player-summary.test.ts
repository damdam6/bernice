import { describe, expect, it } from 'vitest'
import { computePlayerSummaries } from './player-summary'
import type { EventDefinition, EventScore, Player, Session, SessionEntry } from '../../shared/domain'

const SHUTTLE: EventDefinition = {
  key: '드리블셔틀런',
  valueKind: 'time',
  target: '1:17',
  targetValue: 77,
  maxScore: null,
  direction: '낮을수록',
}
const BASKET: EventDefinition = {
  key: '골밑슛',
  valueKind: 'count',
  target: '5',
  targetValue: 5,
  maxScore: 10,
  direction: '높을수록',
}
const EVENTS: EventDefinition[] = [SHUTTLE, BASKET]

function recorded(value: number, display: string): EventScore {
  return { status: 'recorded', value, display }
}
function exempt(): EventScore {
  return { status: 'exempt', value: null, display: null }
}
function unmeasured(): EventScore {
  return { status: 'unmeasured', value: null, display: null }
}
function invalid(display: string, reason: string): EventScore {
  return { status: 'invalid', value: null, display, reason }
}

function entry(playerId: number, name: string, scores: Record<string, EventScore>): SessionEntry {
  const participated = Object.values(scores).some((score) => score.status !== 'unmeasured')
  return { playerId, name, scores, participated }
}

// 선수1: 낮을수록/높을수록 양쪽 종목에서 면제·이상값을 낀 시계열 + PB 동률/비갱신
// 선수2(탈퇴): 유효 기록이 있어도 결과에서 완전히 제외돼야 함
// 선수3(비대상)·선수4(휴식): 프로필용 trends/personalBests는 정상 채움
// 선수5: 초반 회차엔 엔트리 자체가 없던(늦게 가입한) 케이스
// 선수6: 어떤 회차에도 엔트리가 없어 기록이 전혀 없는 케이스
const PLAYERS: Player[] = [
  { id: 1, name: '선수1', status: '활동' },
  { id: 2, name: '선수2', status: '탈퇴' },
  { id: 3, name: '선수3', status: '비대상' },
  { id: 4, name: '선수4', status: '휴식' },
  { id: 5, name: '선수5', status: '활동' },
  { id: 6, name: '선수6', status: '활동' },
]

const SESSIONS: Session[] = [
  {
    date: '2025-01-01',
    entries: [
      entry(1, '선수1', { [SHUTTLE.key]: recorded(80, '1:20'), [BASKET.key]: recorded(5, '5') }),
      entry(2, '선수2', { [SHUTTLE.key]: recorded(50, '0:50'), [BASKET.key]: recorded(5, '5') }),
      entry(4, '선수4', { [SHUTTLE.key]: unmeasured(), [BASKET.key]: recorded(3, '3') }),
    ],
  },
  {
    date: '2025-02-01',
    entries: [
      entry(1, '선수1', { [SHUTTLE.key]: exempt(), [BASKET.key]: invalid('6개', '개수 값이 올바르지 않음') }),
      entry(3, '선수3', { [SHUTTLE.key]: recorded(70, '1:10'), [BASKET.key]: unmeasured() }),
      entry(4, '선수4', { [SHUTTLE.key]: unmeasured(), [BASKET.key]: unmeasured() }),
    ],
  },
  {
    date: '2025-03-01',
    entries: [
      entry(1, '선수1', { [SHUTTLE.key]: recorded(75, '1:15'), [BASKET.key]: recorded(6, '6') }),
      entry(5, '선수5', { [SHUTTLE.key]: recorded(76, '1:16'), [BASKET.key]: unmeasured() }),
    ],
  },
  {
    date: '2025-04-01',
    entries: [
      entry(1, '선수1', { [SHUTTLE.key]: recorded(75, '1:15'), [BASKET.key]: recorded(4, '4') }),
      entry(5, '선수5', { [SHUTTLE.key]: recorded(74, '1:14'), [BASKET.key]: unmeasured() }),
    ],
  },
]

describe('computePlayerSummaries', () => {
  const summaries = computePlayerSummaries(EVENTS, PLAYERS, SESSIONS)

  it('탈퇴 선수는 유효 기록이 있어도 결과에서 완전히 제외한다', () => {
    expect(summaries.map((s) => s.id)).toEqual([1, 3, 4, 5, 6])
  })

  it('낮을수록 종목: 면제를 건너뛰고 직전 유효 기록 기준으로 delta/improved를 계산한다', () => {
    const player1 = summaries.find((s) => s.id === 1)!
    const shuttleTrend = player1.trends.find((t) => t.event === SHUTTLE.key)!
    expect(shuttleTrend.points).toEqual([
      { sessionDate: '2025-01-01', value: 80, display: '1:20', achieved: false, deltaFromPrevious: null, improved: null },
      { sessionDate: '2025-03-01', value: 75, display: '1:15', achieved: true, deltaFromPrevious: -5, improved: true },
      { sessionDate: '2025-04-01', value: 75, display: '1:15', achieved: true, deltaFromPrevious: 0, improved: false },
    ])
  })

  it('높을수록 종목: 이상값을 건너뛰고 direction 반영 achieved/improved를 계산한다', () => {
    const player1 = summaries.find((s) => s.id === 1)!
    const basketTrend = player1.trends.find((t) => t.event === BASKET.key)!
    expect(basketTrend.points).toEqual([
      { sessionDate: '2025-01-01', value: 5, display: '5', achieved: true, deltaFromPrevious: null, improved: null },
      { sessionDate: '2025-03-01', value: 6, display: '6', achieved: true, deltaFromPrevious: 1, improved: true },
      { sessionDate: '2025-04-01', value: 4, display: '4', achieved: false, deltaFromPrevious: -2, improved: false },
    ])
  })

  it('PB는 direction 기준 최고값을 고르고, 동률이면 최초 달성 회차를 쓰며, 이후 더 나빠진 기록에 갱신되지 않는다', () => {
    const player1 = summaries.find((s) => s.id === 1)!
    expect(player1.personalBests).toEqual([
      { event: SHUTTLE.key, value: 75, display: '1:15', sessionDate: '2025-03-01', achieved: true },
      { event: BASKET.key, value: 6, display: '6', sessionDate: '2025-03-01', achieved: true },
    ])
  })

  it('비대상 선수도 프로필용 trends/personalBests를 정상 채운다 — 기록 없는 종목은 points: []이고 personalBests는 스파스', () => {
    const player3 = summaries.find((s) => s.id === 3)!
    expect(player3.status).toBe('비대상')
    expect(player3.trends).toEqual([
      {
        event: SHUTTLE.key,
        points: [{ sessionDate: '2025-02-01', value: 70, display: '1:10', achieved: true, deltaFromPrevious: null, improved: null }],
      },
      { event: BASKET.key, points: [] },
    ])
    expect(player3.personalBests).toEqual([
      { event: SHUTTLE.key, value: 70, display: '1:10', sessionDate: '2025-02-01', achieved: true },
    ])
  })

  it('휴식 선수도 정상 포함되고, 목표 미달성(achieved: false) 기록도 그대로 반영한다', () => {
    const player4 = summaries.find((s) => s.id === 4)!
    expect(player4.status).toBe('휴식')
    expect(player4.trends.find((t) => t.event === SHUTTLE.key)?.points).toEqual([])
    expect(player4.trends.find((t) => t.event === BASKET.key)?.points).toEqual([
      { sessionDate: '2025-01-01', value: 3, display: '3', achieved: false, deltaFromPrevious: null, improved: null },
    ])
    expect(player4.personalBests).toEqual([
      { event: BASKET.key, value: 3, display: '3', sessionDate: '2025-01-01', achieved: false },
    ])
  })

  it('초반 회차에 아직 미가입이었던 선수는 그 회차들이 데이터 포인트로 취급되지 않는다(미측정이 아니라 아예 없음)', () => {
    const player5 = summaries.find((s) => s.id === 5)!
    const shuttleTrend = player5.trends.find((t) => t.event === SHUTTLE.key)!
    expect(shuttleTrend.points).toEqual([
      { sessionDate: '2025-03-01', value: 76, display: '1:16', achieved: true, deltaFromPrevious: null, improved: null },
      { sessionDate: '2025-04-01', value: 74, display: '1:14', achieved: true, deltaFromPrevious: -2, improved: true },
    ])
    expect(player5.personalBests).toEqual([
      { event: SHUTTLE.key, value: 74, display: '1:14', sessionDate: '2025-04-01', achieved: true },
    ])
  })

  it('한 번도 기록이 없는 선수는 모든 종목이 points: []이고 personalBests는 완전히 빈 배열이다', () => {
    const player6 = summaries.find((s) => s.id === 6)!
    expect(player6.trends).toEqual([
      { event: SHUTTLE.key, points: [] },
      { event: BASKET.key, points: [] },
    ])
    expect(player6.personalBests).toEqual([])
  })
})

describe('computePlayerSummaries — 경계값·빈 입력', () => {
  it('낮을수록 종목: 목표치와 정확히 같아도 달성으로 처리한다', () => {
    const players: Player[] = [{ id: 1, name: '선수1', status: '활동' }]
    const sessions: Session[] = [
      { date: '2025-01-01', entries: [entry(1, '선수1', { [SHUTTLE.key]: recorded(77, '1:17') })] },
    ]
    const [summary] = computePlayerSummaries([SHUTTLE], players, sessions)
    expect(summary.trends[0].points[0].achieved).toBe(true)
    expect(summary.personalBests[0].achieved).toBe(true)
  })

  it('선수/종목/회차가 모두 없으면 빈 배열을 돌려준다', () => {
    expect(computePlayerSummaries([], [], [])).toEqual([])
  })
})
