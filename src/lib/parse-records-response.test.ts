import { describe, expect, it } from 'vitest'
import type { RecordsResponse } from '../../shared/domain'
import { parseEventScore, parseRecordsResponse } from './parse-records-response'

// 모든 가지(EventScore 4종 status·null 허용 필드·latestSession 존재)를 실제로 지나는 완전 픽스처.
// RecordsResponse로 타입해 domain.ts와의 정합을 컴파일 시점에 보장한다.
const FULL_RESPONSE: RecordsResponse = {
  generatedAt: '2026-07-17T00:00:00.000Z',
  events: [
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
    { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
  ],
  players: [
    {
      id: 1,
      name: '선수1',
      status: '활동',
      trends: [
        {
          event: '골밑슛',
          points: [
            { sessionDate: '2026-07-10', value: 6, display: '6', achieved: true, deltaFromPrevious: null, improved: null },
            { sessionDate: '2026-07-17', value: 7, display: '7', achieved: true, deltaFromPrevious: 1, improved: true },
          ],
        },
        { event: '드리블셔틀런', points: [] },
      ],
      personalBests: [
        { event: '골밑슛', value: 7, display: '7', sessionDate: '2026-07-17', achieved: true },
      ],
    },
    { id: 2, name: '선수2', status: '휴식', trends: [], personalBests: [] },
  ],
  sessions: [
    {
      date: '2026-07-17',
      entries: [
        {
          playerId: 1,
          name: '선수1',
          scores: {
            골밑슛: { status: 'recorded', value: 7, display: '7' },
            드리블셔틀런: { status: 'exempt', value: null, display: null },
          },
          participated: true,
        },
        {
          playerId: 2,
          name: '선수2',
          scores: {
            골밑슛: { status: 'unmeasured', value: null, display: null },
            드리블셔틀런: { status: 'invalid', value: null, display: '1:75', reason: '초는 60 미만이어야 합니다' },
          },
          participated: true,
        },
      ],
    },
  ],
  rankings: [
    {
      sessionDate: '2026-07-17',
      events: [
        {
          event: '골밑슛',
          entries: [{ playerId: 1, name: '선수1', value: 7, display: '7', rank: 1, achieved: true }],
        },
      ],
    },
  ],
  home: {
    latestSession: { date: '2026-07-17', participantCount: 2 },
    achievementRates: [{ event: '골밑슛', achievedCount: 1, eligibleCount: 1, rate: 1 }],
  },
}

// JSON 왕복으로 프로토타입·undefined 흔적을 지운 순수 페이로드 — 실제 res.json() 결과와 동형.
function payload(mutate?: (draft: Record<string, unknown>) => void): unknown {
  const draft = JSON.parse(JSON.stringify(FULL_RESPONSE)) as Record<string, unknown>
  mutate?.(draft)
  return draft
}

describe('parseRecordsResponse', () => {
  it('계약을 지키는 완전 응답은 동등한 객체로 조립된다', () => {
    expect(parseRecordsResponse(payload())).toEqual(FULL_RESPONSE)
  })

  it('빈 컬렉션 응답(초기 상태)도 통과한다', () => {
    const empty: RecordsResponse = {
      generatedAt: '2026-07-17T00:00:00.000Z',
      events: [],
      players: [],
      sessions: [],
      rankings: [],
      home: { latestSession: null, achievementRates: [] },
    }
    expect(parseRecordsResponse(JSON.parse(JSON.stringify(empty)))).toEqual(empty)
  })

  it('객체가 아닌 최상위 값은 거부한다', () => {
    expect(parseRecordsResponse(null)).toBeNull()
    expect(parseRecordsResponse([])).toBeNull()
    expect(parseRecordsResponse('{}')).toBeNull()
  })

  it('최상위 필드 누락·타입 오류를 거부한다', () => {
    expect(parseRecordsResponse(payload((d) => delete d.generatedAt))).toBeNull()
    expect(parseRecordsResponse(payload((d) => (d.events = {})))).toBeNull()
    expect(parseRecordsResponse(payload((d) => (d.players = 'x')))).toBeNull()
    expect(parseRecordsResponse(payload((d) => delete d.home))).toBeNull()
  })

  it('중첩 원소 하나의 위반도 전체 거부로 이어진다', () => {
    expect(
      parseRecordsResponse(
        payload((d) => {
          const events = d.events as Record<string, unknown>[]
          events[1].direction = '무작위'
        }),
      ),
    ).toBeNull()
    expect(
      parseRecordsResponse(
        payload((d) => {
          const players = d.players as Record<string, unknown>[]
          players[0].trends = [{ event: '골밑슛' }] // points 누락
        }),
      ),
    ).toBeNull()
    expect(
      parseRecordsResponse(
        payload((d) => {
          const rankings = d.rankings as { events: { entries: Record<string, unknown>[] }[] }[]
          rankings[0].events[0].entries[0].rank = '1' // 숫자여야 함
        }),
      ),
    ).toBeNull()
  })

  it("응답에 나타날 수 없는 '탈퇴' 상태는 거부한다 (domain.ts Exclude 미러)", () => {
    expect(
      parseRecordsResponse(
        payload((d) => {
          const players = d.players as Record<string, unknown>[]
          players[1].status = '탈퇴'
        }),
      ),
    ).toBeNull()
  })

  it('TrendPoint의 null 허용 필드는 null·값 둘 다 통과, 그 외 타입은 거부한다', () => {
    expect(
      parseRecordsResponse(
        payload((d) => {
          const players = d.players as { trends: { points: Record<string, unknown>[] }[] }[]
          players[0].trends[0].points[1].deltaFromPrevious = 'up'
        }),
      ),
    ).toBeNull()
  })
})

describe('parseEventScore', () => {
  it('recorded — value·display를 조립한다', () => {
    expect(parseEventScore({ status: 'recorded', value: 72, display: '1:12' })).toEqual({
      status: 'recorded',
      value: 72,
      display: '1:12',
    })
  })

  it('exempt·unmeasured — value/display가 null이어야 통과한다', () => {
    expect(parseEventScore({ status: 'exempt', value: null, display: null })).toEqual({
      status: 'exempt',
      value: null,
      display: null,
    })
    expect(parseEventScore({ status: 'unmeasured', value: null, display: null })).toEqual({
      status: 'unmeasured',
      value: null,
      display: null,
    })
    expect(parseEventScore({ status: 'exempt', value: 3, display: null })).toBeNull()
  })

  it('invalid — display·reason 문자열을 요구한다', () => {
    expect(
      parseEventScore({ status: 'invalid', value: null, display: '1:75', reason: '초 범위 초과' }),
    ).toEqual({ status: 'invalid', value: null, display: '1:75', reason: '초 범위 초과' })
    expect(parseEventScore({ status: 'invalid', value: null, display: '1:75' })).toBeNull()
  })

  it('모르는 status·비객체는 거부한다', () => {
    expect(parseEventScore({ status: 'pending', value: 1, display: '1' })).toBeNull()
    expect(parseEventScore('recorded')).toBeNull()
    expect(parseEventScore(null)).toBeNull()
  })

  it('recorded의 value 타입 위반을 거부한다', () => {
    expect(parseEventScore({ status: 'recorded', value: '72', display: '1:12' })).toBeNull()
  })
})
