import { describe, expect, it } from 'vitest'
import { computeEventRanking, computeSessionRankings } from './compute-rankings'
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
function invalid(display: string, reason = '이상값'): EventScore {
  return { status: 'invalid', value: null, display, reason }
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

describe('computeEventRanking', () => {
  it('낮을수록 방향: 값이 작을수록 상위', () => {
    const shuttleRun = event({ key: '셔틀런', direction: '낮을수록', targetValue: 77 })
    const players = [player(1, '활동'), player(2, '활동')]
    const entries = [entry(1, { 셔틀런: recorded(80, '1:20') }), entry(2, { 셔틀런: recorded(70, '1:10') })]

    const result = computeEventRanking(shuttleRun, entries, players)

    expect(result.entries.map((e) => [e.playerId, e.rank])).toEqual([
      [2, 1],
      [1, 2],
    ])
  })

  it('높을수록 방향: 값이 클수록 상위', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동'), player(2, '활동')]
    const entries = [entry(1, { 골밑슛: recorded(3) }), entry(2, { 골밑슛: recorded(8) })]

    const result = computeEventRanking(layup, entries, players)

    expect(result.entries.map((e) => [e.playerId, e.rank])).toEqual([
      [2, 1],
      [1, 2],
    ])
  })

  it('면제·빈칸(미측정)·이상값은 랭킹에서 제외', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동'), player(2, '활동'), player(3, '활동'), player(4, '활동')]
    const entries = [
      entry(1, { 골밑슛: recorded(6) }),
      entry(2, { 골밑슛: exempt() }),
      entry(3, { 골밑슛: unmeasured() }),
      entry(4, { 골밑슛: invalid('6개') }),
    ]

    const result = computeEventRanking(layup, entries, players)

    expect(result.entries).toEqual([{ playerId: 1, name: '선수1', value: 6, display: '6', rank: 1, achieved: true }])
  })

  it('상태 4종 혼합: 활동만 집계, 탈퇴·비대상·휴식은 제외', () => {
    const shuttleRun = event({ key: '셔틀런', direction: '높을수록', targetValue: 10 })
    const players = [player(1, '활동'), player(2, '탈퇴'), player(3, '비대상'), player(4, '휴식')]
    const entries = [
      entry(1, { 셔틀런: recorded(50) }),
      entry(2, { 셔틀런: recorded(100) }),
      entry(3, { 셔틀런: recorded(90) }),
      entry(4, { 셔틀런: recorded(80) }),
    ]

    const result = computeEventRanking(shuttleRun, entries, players)

    expect(result.entries).toEqual([{ playerId: 1, name: '선수1', value: 50, display: '50', rank: 1, achieved: true }])
  })

  it('동점 처리: 표준 공동순위(1,1,3) — 2명 동점이면 다음 등수는 2명만큼 건너뜀', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 0 })
    const players = [player(1, '활동'), player(2, '활동'), player(3, '활동')]
    const entries = [entry(1, { 골밑슛: recorded(100) }), entry(2, { 골밑슛: recorded(100) }), entry(3, { 골밑슛: recorded(80) })]

    const result = computeEventRanking(layup, entries, players)

    expect(result.entries.map((e) => e.rank)).toEqual([1, 1, 3])
  })

  it('동점 처리: 3명 동점이면 다음 등수는 4', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 0 })
    const players = [player(1, '활동'), player(2, '활동'), player(3, '활동'), player(4, '활동')]
    const entries = [
      entry(1, { 골밑슛: recorded(100) }),
      entry(2, { 골밑슛: recorded(100) }),
      entry(3, { 골밑슛: recorded(100) }),
      entry(4, { 골밑슛: recorded(50) }),
    ]

    const result = computeEventRanking(layup, entries, players)

    expect(result.entries.map((e) => e.rank)).toEqual([1, 1, 1, 4])
  })

  it('동점자는 입력(시트 행) 순서를 그대로 유지한다 (안정 정렬)', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 0 })
    const players = [player(3, '활동'), player(1, '활동'), player(2, '활동')]
    const entries = [
      entry(3, { 골밑슛: recorded(100) }),
      entry(1, { 골밑슛: recorded(100) }),
      entry(2, { 골밑슛: recorded(100) }),
    ]

    const result = computeEventRanking(layup, entries, players)

    expect(result.entries.map((e) => e.playerId)).toEqual([3, 1, 2])
  })

  it('동점 판정은 정규화된 value 기준이지 display 문자열이 아니다', () => {
    const shuttleRun = event({ key: '셔틀런', direction: '낮을수록', targetValue: 77 })
    const players = [player(1, '활동'), player(2, '활동')]
    // display 표기는 다르지만("1:15" vs "75") 정규화된 초 단위 value는 동일 → 동점
    const entries = [entry(1, { 셔틀런: recorded(75, '1:15') }), entry(2, { 셔틀런: recorded(75, '75') })]

    const result = computeEventRanking(shuttleRun, entries, players)

    expect(result.entries.map((e) => e.rank)).toEqual([1, 1])
  })

  it('유효 엔트리가 없어도 이벤트 자체는 생략하지 않고 entries: []를 반환한다', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동')]
    const entries = [entry(1, { 골밑슛: unmeasured() })]

    const result = computeEventRanking(layup, entries, players)

    expect(result).toEqual({ event: '골밑슛', entries: [] })
  })

  it('entries·players가 모두 빈 배열이어도 entries: []를 반환한다', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })

    expect(computeEventRanking(layup, [], [])).toEqual({ event: '골밑슛', entries: [] })
  })

  it('scores에 종목 key 자체가 없으면(계약 위반 방어) 크래시하지 않고 제외한다', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동')]
    const entries = [entry(1, {})] // 골밑슛 key가 아예 없는 방어적 케이스 — 파서(#27) 완성 전까지는 실제로 나올 수 있음

    expect(() => computeEventRanking(layup, entries, players)).not.toThrow()
    expect(computeEventRanking(layup, entries, players).entries).toEqual([])
  })

  it('players 목록에 없는 playerId의 엔트리는 제외된다', () => {
    const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
    const players = [player(1, '활동')]
    const entries = [entry(1, { 골밑슛: recorded(6) }), entry(99, { 골밑슛: recorded(100) })]

    const result = computeEventRanking(layup, entries, players)

    expect(result.entries).toEqual([{ playerId: 1, name: '선수1', value: 6, display: '6', rank: 1, achieved: true }])
  })

  describe('달성(achieved) 판정 — 경계값 포함', () => {
    it('낮을수록: targetValue와 정확히 같으면 달성', () => {
      const shuttleRun = event({ key: '셔틀런', direction: '낮을수록', targetValue: 77 })
      const players = [player(1, '활동')]
      const entries = [entry(1, { 셔틀런: recorded(77) })]

      expect(computeEventRanking(shuttleRun, entries, players).entries[0].achieved).toBe(true)
    })

    it('낮을수록: targetValue보다 1 크면 미달성', () => {
      const shuttleRun = event({ key: '셔틀런', direction: '낮을수록', targetValue: 77 })
      const players = [player(1, '활동')]
      const entries = [entry(1, { 셔틀런: recorded(78) })]

      expect(computeEventRanking(shuttleRun, entries, players).entries[0].achieved).toBe(false)
    })

    it('높을수록: targetValue와 정확히 같으면 달성', () => {
      const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
      const players = [player(1, '활동')]
      const entries = [entry(1, { 골밑슛: recorded(5) })]

      expect(computeEventRanking(layup, entries, players).entries[0].achieved).toBe(true)
    })

    it('높을수록: targetValue보다 1 작으면 미달성', () => {
      const layup = event({ key: '골밑슛', direction: '높을수록', targetValue: 5 })
      const players = [player(1, '활동')]
      const entries = [entry(1, { 골밑슛: recorded(4) })]

      expect(computeEventRanking(layup, entries, players).entries[0].achieved).toBe(false)
    })
  })
})

describe('computeSessionRankings', () => {
  it('docs/records-schema.html §06 예시 응답과 동일한 출력을 낸다', () => {
    // valueKind/target/maxScore도 문서 예시(§06)와 동일하게 맞춘다 — 랭킹 로직엔 영향 없지만 픽스처 충실도용.
    const shuttleRun = event({
      key: '드리블셔틀런',
      direction: '낮을수록',
      targetValue: 77,
      valueKind: 'time',
      target: '1:17',
      maxScore: null,
    })
    const layup = event({
      key: '골밑슛',
      direction: '높을수록',
      targetValue: 5,
      valueKind: 'count',
      target: '5',
      maxScore: 10,
    })
    const events = [shuttleRun, layup]

    const players = [player(1, '활동', '선수1'), player(3, '활동', '선수3'), player(5, '휴식', '선수5'), player(7, '활동', '선수7')]

    const session: Session = {
      date: '2025-05-16',
      entries: [
        entry(1, { 드리블셔틀런: recorded(72, '1:12'), 골밑슛: recorded(5, '5') }, '선수1'),
        entry(
          3,
          { 드리블셔틀런: recorded(70, '1:10'), 골밑슛: invalid('6개', '개수 값이 올바르지 않음 (0 이상의 정수여야 함)') },
          '선수3',
        ),
        entry(5, { 드리블셔틀런: recorded(76, '1:16'), 골밑슛: exempt() }, '선수5'),
        entry(7, { 드리블셔틀런: unmeasured(), 골밑슛: unmeasured() }, '선수7'),
      ],
    }

    const result = computeSessionRankings(session, events, players)

    expect(result).toEqual({
      sessionDate: '2025-05-16',
      events: [
        {
          event: '드리블셔틀런',
          entries: [
            { playerId: 3, name: '선수3', value: 70, display: '1:10', rank: 1, achieved: true },
            { playerId: 1, name: '선수1', value: 72, display: '1:12', rank: 2, achieved: true },
          ],
        },
        {
          event: '골밑슛',
          entries: [{ playerId: 1, name: '선수1', value: 5, display: '5', rank: 1, achieved: true }],
        },
      ],
    })
  })

  it('여러 종목이 있으면 각 종목이 events 배열 순서·개수 그대로 독립적으로 계산된다', () => {
    const a = event({ key: 'A', direction: '높을수록', targetValue: 0 })
    const b = event({ key: 'B', direction: '높을수록', targetValue: 0 })
    const players = [player(1, '활동')]
    const session: Session = { date: '2025-06-01', entries: [entry(1, { A: recorded(1), B: unmeasured() })] }

    const result = computeSessionRankings(session, [a, b], players)

    expect(result.events.map((e) => e.event)).toEqual(['A', 'B'])
    expect(result.events[1].entries).toEqual([])
  })
})
