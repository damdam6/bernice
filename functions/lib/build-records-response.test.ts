import { describe, expect, it } from 'vitest'
import { RecordsAssemblyError, buildRecordsResponse } from './build-records-response'
import type { SheetRawBundle } from './sheetsApi'

const ROSTER_ROWS = [
  ['이름', '상태'],
  ['철수', '활동'],
  ['영희', '탈퇴'],
  ['민수', '휴식'],
]

const GOALS_ROWS = [
  ['종목', '목표', '만점', '방향'],
  ['골밑슛', '5', '10', '높을수록'],
]

const ROUND_ROWS = [
  ['이름', '골밑슛'],
  ['철수', '6'],
  ['영희', '7'],
  ['민수', '3'],
]

function baseBundle(overrides: Partial<SheetRawBundle> = {}): SheetRawBundle {
  return {
    roster: { name: '버니스명단', values: ROSTER_ROWS },
    goals: { name: '목표', values: GOALS_ROWS },
    rounds: [{ name: '2025-05-16', date: new Date('2025-05-16'), values: ROUND_ROWS }],
    unclassified: [],
    ...overrides,
  }
}

describe('buildRecordsResponse', () => {
  it('버니스명단 탭이 없으면 missing_roster_tab 에러', () => {
    const bundle = baseBundle({ roster: null })

    expect(() => buildRecordsResponse(bundle, '2026-01-01T00:00:00.000Z')).toThrow(RecordsAssemblyError)
    try {
      buildRecordsResponse(bundle, '2026-01-01T00:00:00.000Z')
    } catch (e) {
      expect((e as RecordsAssemblyError).code).toBe('missing_roster_tab')
    }
  })

  it('목표 탭이 없으면 missing_goals_tab 에러', () => {
    const bundle = baseBundle({ goals: null })

    try {
      buildRecordsResponse(bundle, '2026-01-01T00:00:00.000Z')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(RecordsAssemblyError)
      expect((e as RecordsAssemblyError).code).toBe('missing_goals_tab')
    }
  })

  it('탈퇴 선수는 sessions[].entries · players · rankings 어디에도 등장하지 않는다', () => {
    const result = buildRecordsResponse(baseBundle(), '2026-01-01T00:00:00.000Z')

    expect(result.sessions[0].entries.map((e) => e.name)).toEqual(['철수', '민수'])
    expect(result.players.map((p) => p.name)).toEqual(['철수', '민수'])
    expect(result.rankings[0].events[0].entries.map((e) => e.name)).toEqual(['철수'])
  })

  it('활동·비대상·휴식 상태는 players[]에 포함되고 랭킹은 활동만 집계', () => {
    const result = buildRecordsResponse(baseBundle(), '2026-01-01T00:00:00.000Z')

    const minsu = result.players.find((p) => p.name === '민수')
    expect(minsu?.status).toBe('휴식')
    // 민수는 활동이 아니므로 랭킹(활동+recorded만)에서는 제외
    expect(result.rankings[0].events[0].entries.some((e) => e.name === '민수')).toBe(false)
  })

  it('home.achievementRates는 최신 회차의 활동+recorded만 분모로 집계', () => {
    const result = buildRecordsResponse(baseBundle(), '2026-01-01T00:00:00.000Z')

    expect(result.home.latestSession).toEqual({ date: '2025-05-16', participantCount: 1 })
    expect(result.home.achievementRates).toEqual([{ event: '골밑슛', achievedCount: 1, eligibleCount: 1, rate: 1 }])
  })

  it('회차가 하나도 없으면 sessions/rankings 빈 배열, home 기본값', () => {
    const bundle = baseBundle({ rounds: [] })

    const result = buildRecordsResponse(bundle, '2026-01-01T00:00:00.000Z')

    expect(result.sessions).toEqual([])
    expect(result.rankings).toEqual([])
    expect(result.home).toEqual({ latestSession: null, achievementRates: [] })
  })

  it('generatedAt을 그대로 응답에 싣는다', () => {
    const result = buildRecordsResponse(baseBundle(), '2026-01-01T00:00:00.000Z')

    expect(result.generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('실제 2025-05-16 탭 형태(명단은 가입순, 회차는 참가자 일부만 가나다순)도 정상 조립된다 (이슈 #60)', () => {
    // 명단(가입순): 다솜(1), 가영(2), 라희(3), 나은(4), 마루(5) — 회차엔 라희를 뺀 4명만, 가나다순으로 수기 입력
    const roster = [
      ['이름', '상태'],
      ['다솜', '활동'],
      ['가영', '활동'],
      ['라희', '활동'],
      ['나은', '활동'],
      ['마루', '활동'],
    ]
    const round = [
      ['이름', '골밑슛'],
      ['가영', '6'],
      ['나은', '5'],
      ['다솜', '4'],
      ['마루', '3'],
    ]
    const bundle = baseBundle({
      roster: { name: '버니스명단', values: roster },
      rounds: [{ name: '2025-05-16', date: new Date('2025-05-16'), values: round }],
    })

    const result = buildRecordsResponse(bundle, '2026-01-01T00:00:00.000Z')

    expect(result.sessions[0].entries.map((e) => ({ playerId: e.playerId, name: e.name }))).toEqual([
      { playerId: 2, name: '가영' },
      { playerId: 4, name: '나은' },
      { playerId: 1, name: '다솜' },
      { playerId: 5, name: '마루' },
    ])
    expect(result.rankings[0].events[0].entries.map((e) => e.name)).toEqual(
      expect.arrayContaining(['가영', '나은', '다솜', '마루']),
    )
  })
})
