import { describe, expect, it } from 'vitest'
import type { EventDefinition, RankDirection } from '../../shared/domain'
import {
  buildWritePlan,
  columnLetter,
  evaluateScores,
  locateParticipantRow,
  mapHeaderToEvents,
  validateScoreKeys,
} from './record-write'

// key·valueKind만 검증에 쓰이지만 타입 충족을 위해 나머지 필드도 채운다.
function ev(key: string, valueKind: 'count' | 'time', direction: RankDirection = '높을수록'): EventDefinition {
  return { key, valueKind, target: '0', targetValue: 0, maxScore: null, direction }
}

const EVENTS: EventDefinition[] = [
  ev('드리블셔틀런', 'time', '낮을수록'),
  ev('골밑슛', 'count'),
  ev('자유투', 'count'),
  ev('45도패스캐치', 'count'),
]
const HEADER = ['이름', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']

describe('columnLetter', () => {
  it('1-based 열 번호를 A1 열 문자로 변환한다', () => {
    expect(columnLetter(1)).toBe('A')
    expect(columnLetter(2)).toBe('B')
    expect(columnLetter(5)).toBe('E')
    expect(columnLetter(26)).toBe('Z')
    expect(columnLetter(27)).toBe('AA')
    expect(columnLetter(52)).toBe('AZ')
    expect(columnLetter(53)).toBe('BA')
  })

  it('1 미만·비정수는 거부한다', () => {
    expect(() => columnLetter(0)).toThrow()
    expect(() => columnLetter(-1)).toThrow()
    expect(() => columnLetter(1.5)).toThrow()
  })
})

describe('locateParticipantRow', () => {
  const rows = [
    HEADER,
    ['선수1', '1:10', '5', '3', ''],
    ['선수7', '1:12', '6', '면제', ''],
    ['선수9', '', '', '', ''],
  ]

  it('이름이 있는 데이터 행의 시트 행 번호(1-based, 헤더=1행)를 돌려준다', () => {
    expect(locateParticipantRow(rows, '선수7')).toEqual({ kind: 'found', rowNumber: 3 })
    expect(locateParticipantRow(rows, '선수1')).toEqual({ kind: 'found', rowNumber: 2 })
  })

  it('명단 이름이 이름 열에 없으면 not_participant', () => {
    expect(locateParticipantRow(rows, '선수99')).toEqual({ kind: 'not_participant' })
  })

  it('이름 셀이 NFD로 들어와도 NFC 매칭한다', () => {
    const name = '박준영'
    const nfdRows = [HEADER, [name.normalize('NFD'), '1:10', '5', '3', '']]
    expect(locateParticipantRow(nfdRows, name.normalize('NFC'))).toEqual({ kind: 'found', rowNumber: 2 })
  })

  it('같은 이름이 두 행에 있으면(동명 중복) Error로 대상 특정을 거부한다', () => {
    const dupRows = [HEADER, ['선수7', '', '', '', ''], ['선수7', '', '', '', '']]
    expect(() => locateParticipantRow(dupRows, '선수7')).toThrow(/중복/)
  })

  it('빈 이름 셀은 건너뛴다', () => {
    const withBlank = [HEADER, ['', '', '', '', ''], ['선수7', '6', '', '', '']]
    expect(locateParticipantRow(withBlank, '선수7')).toEqual({ kind: 'found', rowNumber: 3 })
  })
})

describe('validateScoreKeys', () => {
  it('key 집합이 events와 정확히 일치하면 missing·unknown 모두 비었다', () => {
    const scores = { 드리블셔틀런: '1:12', 골밑슛: '6', 자유투: '면제', '45도패스캐치': '' }
    expect(validateScoreKeys(scores, EVENTS)).toEqual({ missing: [], unknown: [] })
  })

  it('누락된 종목 key를 missing으로 보고한다', () => {
    const scores = { 드리블셔틀런: '1:12', 골밑슛: '6' }
    const result = validateScoreKeys(scores, EVENTS)
    expect(result.missing).toEqual(['자유투', '45도패스캐치'])
    expect(result.unknown).toEqual([])
  })

  it('알 수 없는 key를 unknown으로 보고한다', () => {
    const scores = { 드리블셔틀런: '1:12', 골밑슛: '6', 자유투: '면제', '45도패스캐치': '', 없는종목: '3' }
    const result = validateScoreKeys(scores, EVENTS)
    expect(result.missing).toEqual([])
    expect(result.unknown).toEqual(['없는종목'])
  })

  it('key를 NFC 정규화해 비교한다(NFD 입력도 일치)', () => {
    const nfdScores: Record<string, string> = {
      ['드리블셔틀런'.normalize('NFD')]: '1:12',
      ['골밑슛'.normalize('NFD')]: '6',
      ['자유투'.normalize('NFD')]: '면제',
      ['45도패스캐치'.normalize('NFD')]: '',
    }
    expect(validateScoreKeys(nfdScores, EVENTS)).toEqual({ missing: [], unknown: [] })
  })
})

describe('evaluateScores', () => {
  it('normalize-score + valueKind 교차검증으로 EventScore를 만든다', () => {
    const scores = { 드리블셔틀런: '1:12', 골밑슛: '6', 자유투: '면제', '45도패스캐치': '' }
    const { scoreMap, invalid } = evaluateScores(scores, EVENTS)

    expect(invalid).toEqual([])
    expect(scoreMap['드리블셔틀런']).toEqual({ status: 'recorded', value: 72, display: '1:12' })
    expect(scoreMap['골밑슛']).toEqual({ status: 'recorded', value: 6, display: '6' })
    expect(scoreMap['자유투']).toEqual({ status: 'exempt', value: null, display: null })
    expect(scoreMap['45도패스캐치']).toEqual({ status: 'unmeasured', value: null, display: null })
    // scoreMap은 events 순서를 따른다
    expect(Object.keys(scoreMap)).toEqual(EVENTS.map((e) => e.key))
  })

  it('normalize-score invalid(예: 1:75)는 invalid로 사유와 함께 보고한다', () => {
    const scores = { 드리블셔틀런: '1:75', 골밑슛: '6', 자유투: '면제', '45도패스캐치': '' }
    const { scoreMap, invalid } = evaluateScores(scores, EVENTS)

    expect(scoreMap['드리블셔틀런'].status).toBe('invalid')
    expect(invalid).toHaveLength(1)
    expect(invalid[0].event).toBe('드리블셔틀런')
    expect(invalid[0].reason).toMatch(/초 값/)
  })

  it('valueKind 불일치(개수 종목에 시간)는 invalid로 거부한다', () => {
    const scores = { 드리블셔틀런: '1:12', 골밑슛: '1:15', 자유투: '면제', '45도패스캐치': '' }
    const { scoreMap, invalid } = evaluateScores(scores, EVENTS)

    expect(scoreMap['골밑슛'].status).toBe('invalid')
    expect(invalid.map((i) => i.event)).toEqual(['골밑슛'])
    expect(invalid[0].reason).toMatch(/형식/)
  })
})

describe('buildWritePlan', () => {
  it('점수 셀만 B열부터 연속 범위로, 값은 헤더 열 순서로 재배열한다', () => {
    const eventColumns = mapHeaderToEvents(HEADER, EVENTS)
    // 일부러 요청 key 순서를 헤더와 다르게 준다 — 그래도 헤더 순서로 나와야 한다.
    const scores = { 자유투: '면제', '45도패스캐치': '', 드리블셔틀런: '1:12', 골밑슛: '6' }

    const plan = buildWritePlan('2025-08-16', 7, eventColumns, scores)

    expect(plan.range).toBe("'2025-08-16'!B7:E7")
    expect(plan.values).toEqual([['1:12', '6', '면제', '']])
  })

  it('탭 이름의 작은따옴표를 A1 규칙대로 이스케이프한다', () => {
    const eventColumns = mapHeaderToEvents(HEADER, EVENTS)
    const scores = { 드리블셔틀런: '1:12', 골밑슛: '6', 자유투: '면제', '45도패스캐치': '' }

    const plan = buildWritePlan("2025's-tab", 3, eventColumns, scores)

    expect(plan.range).toBe("'2025''s-tab'!B3:E3")
  })
})
