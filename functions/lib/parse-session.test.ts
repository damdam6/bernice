import { describe, expect, it } from 'vitest'
import { parseSession } from './parse-session'
import type { EventDefinition, Player } from '../../shared/domain'

// docs/sheet-integration.html §02 예시를 본뜬 픽스처 — 드리블셔틀런(시간형) + 개수형 3종.
const HEADER = ['이름', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']

function buildEvents(): EventDefinition[] {
  return [
    { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
    { key: '자유투', valueKind: 'count', target: '2', targetValue: 2, maxScore: 5, direction: '높을수록' },
    { key: '45도패스캐치', valueKind: 'count', target: '5', targetValue: 5, maxScore: 7, direction: '높을수록' },
  ]
}

const PLAYER_NAMES = ['선수1', '선수2', '선수3', '선수4', '선수5', '선수6', '선수7']

function buildPlayers(names: string[] = PLAYER_NAMES): Player[] {
  return names.map((name, i) => ({ id: i + 1, name, status: '활동' }))
}

// 선수4: 셔틀런만 미측정(그 칸만 blank, 나머지는 recorded) → participated true
// 선수7: Sheets가 트레일링 빈 셀을 생략해 이름만 남은 행(전 종목 blank) → participated false
function buildFullRows(): string[][] {
  return [
    HEADER,
    ['선수1', '1:12', '5', '2', '6'],
    ['선수2', '1:14', '6', '1', '7'],
    ['선수3', '1:20', '4', '면제', '5'],
    ['선수4', '', '3', '2', '6'],
    ['선수5', '1:16', '8', '2', '면제'],
    ['선수6', '1:19', '6', '3', '6'],
    ['선수7'],
  ]
}

describe('parseSession', () => {
  it('개수형·시간형 혼합 회차를 정상 파싱한다', () => {
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayers(), buildEvents())

    expect(session.date).toBe('2025-05-16')
    expect(session.entries).toHaveLength(7)

    const player1 = session.entries[0]
    expect(player1.playerId).toBe(1)
    expect(player1.name).toBe('선수1')
    expect(player1.participated).toBe(true)
    expect(player1.scores['드리블셔틀런']).toEqual({ status: 'recorded', value: 72, display: '1:12' })
    expect(player1.scores['골밑슛']).toEqual({ status: 'recorded', value: 5, display: '5' })
  })

  it('면제 셀은 exempt로 표현되고 participated는 true로 유지된다', () => {
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayers(), buildEvents())

    const player3 = session.entries[2]
    expect(player3.scores['자유투']).toEqual({ status: 'exempt', value: null, display: null })
    expect(player3.participated).toBe(true)

    const player5 = session.entries[4]
    expect(player5.scores['45도패스캐치']).toEqual({ status: 'exempt', value: null, display: null })
  })

  it('한 종목만 빈칸이면 그 칸만 unmeasured고 participated는 true다', () => {
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayers(), buildEvents())

    const player4 = session.entries[3]
    expect(player4.scores['드리블셔틀런']).toEqual({ status: 'unmeasured', value: null, display: null })
    expect(player4.scores['골밑슛']).toEqual({ status: 'recorded', value: 3, display: '3' })
    expect(player4.participated).toBe(true)
  })

  it('전 종목 미참여(트레일링 셀 생략으로 이름만 남은 행)는 모든 칸 unmeasured, participated는 false다', () => {
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayers(), buildEvents())

    const player7 = session.entries[6]
    expect(player7.playerId).toBe(7)
    expect(player7.participated).toBe(false)
    for (const event of buildEvents()) {
      expect(player7.scores[event.key]).toEqual({ status: 'unmeasured', value: null, display: null })
    }
  })

  it('개수 종목 셀에 시간형 값이 들어오면 invalid로 승격된다(valueKind 교차검증)', () => {
    const rows = [HEADER, ['선수1', '1:12', '1:15', '2', '6']] // 골밑슛(count)에 시간형 입력
    const session = parseSession('2025-05-16', rows, buildPlayers(['선수1']), buildEvents())

    const score = session.entries[0].scores['골밑슛']
    expect(score.status).toBe('invalid')
    if (score.status === 'invalid') {
      expect(score.display).toBe('1:15')
      expect(score.reason).toMatch(/형식/)
    }
  })

  it('시간 종목 셀에 개수형 값이 들어오면 invalid로 승격된다', () => {
    const rows = [HEADER, ['선수1', '72', '5', '2', '6']] // 드리블셔틀런(time)에 개수형 입력
    const session = parseSession('2025-05-16', rows, buildPlayers(['선수1']), buildEvents())

    expect(session.entries[0].scores['드리블셔틀런'].status).toBe('invalid')
  })

  it('normalizeScore가 이상값으로 판별하는 값(예: 1:75)은 그대로 invalid로 전달된다', () => {
    const rows = [HEADER, ['선수1', '1:75', '5', '2', '6']]
    const session = parseSession('2025-05-16', rows, buildPlayers(['선수1']), buildEvents())

    const score = session.entries[0].scores['드리블셔틀런']
    expect(score.status).toBe('invalid')
    if (score.status === 'invalid') {
      expect(score.display).toBe('1:75')
      expect(score.reason).toBeTruthy()
    }
  })

  it('회차 탭 이름 셀이 명단과 일치하지 않으면 Error를 던진다', () => {
    const rows = [HEADER, ['선수1', '1:12', '5', '2', '6']]
    const players = buildPlayers(['다른사람']) // 1번 위치 이름이 다름

    expect(() => parseSession('2025-05-16', rows, players, buildEvents())).toThrow(/일치하지 않습니다/)
  })

  it('이름 셀이 NFD(자모 분해)로 들어와도 NFC 정규화 후 일치하면 정상 통과한다', () => {
    const rows = [HEADER, ['선수1'.normalize('NFD'), '1:12', '5', '2', '6']]
    const session = parseSession('2025-05-16', rows, buildPlayers(['선수1']), buildEvents())

    expect(session.entries[0].name).toBe('선수1')
  })

  it('헤더 열 순서가 목표 탭 순서와 달라도 텍스트 매칭으로 정상 처리한다', () => {
    const shuffledHeader = ['이름', '골밑슛', '드리블셔틀런', '45도패스캐치', '자유투']
    const rows = [shuffledHeader, ['선수1', '5', '1:12', '6', '2']]
    const session = parseSession('2025-05-16', rows, buildPlayers(['선수1']), buildEvents())

    expect(session.entries[0].scores['드리블셔틀런']).toEqual({ status: 'recorded', value: 72, display: '1:12' })
    expect(session.entries[0].scores['골밑슛']).toEqual({ status: 'recorded', value: 5, display: '5' })
  })

  it('헤더 첫 칸이 "이름"이 아니면 Error를 던진다', () => {
    const rows = [['성명', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']]

    expect(() => parseSession('2025-05-16', rows, buildPlayers(), buildEvents())).toThrow(/"이름"/)
  })

  it('알 수 없는 헤더 텍스트는 Error를 던진다', () => {
    const rows = [['이름', '드리블셔틀런', '골밑슛', '자유투', '윗몸일으키기']]

    expect(() => parseSession('2025-05-16', rows, buildPlayers(), buildEvents())).toThrow(/윗몸일으키기/)
  })

  it('종목 컬럼이 누락되면 Error를 던진다', () => {
    const rows = [['이름', '드리블셔틀런', '골밑슛', '자유투']] // 45도패스캐치 컬럼 없음

    expect(() => parseSession('2025-05-16', rows, buildPlayers(), buildEvents())).toThrow(/45도패스캐치/)
  })

  it('헤더에 같은 종목이 중복되면 Error를 던진다', () => {
    const rows = [['이름', '드리블셔틀런', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']]

    expect(() => parseSession('2025-05-16', rows, buildPlayers(), buildEvents())).toThrow(/중복/)
  })

  it('데이터 행이 명단에 없는 위치를 참조하면 Error를 던진다', () => {
    const rows = [HEADER, ['선수1', '1:12', '5', '2', '6'], ['선수2', '1:14', '6', '1', '7']]
    const players = buildPlayers(['선수1']) // 명단 1명뿐인데 행은 2개

    expect(() => parseSession('2025-05-16', rows, players, buildEvents())).toThrow(/명단에 없는 위치/)
  })

  it('데이터 행 수가 명단보다 적은 것(신규 가입자 미포함)은 정상이다', () => {
    const rows = [HEADER, ['선수1', '1:12', '5', '2', '6']]
    const players = buildPlayers() // 명단은 7명, 이 회차엔 1명만 존재

    const session = parseSession('2025-05-16', rows, players, buildEvents())
    expect(session.entries).toHaveLength(1)
  })

  it('완전히 빈 트레일링 행은 스킵되고 그 앞 행의 playerId는 밀리지 않는다', () => {
    const rows = [
      HEADER,
      ['선수1', '1:12', '5', '2', '6'],
      ['', '', '', '', ''], // 범위 조회가 한 행 더 가져온 빈 아티팩트
    ]
    const players = buildPlayers(['선수1', '선수2'])

    const session = parseSession('2025-05-16', rows, players, buildEvents())
    expect(session.entries).toHaveLength(1)
    expect(session.entries[0].playerId).toBe(1)
  })

  it('빈 행 뒤에 실제 데이터 행이 이어져도 playerId가 원래 위치를 유지한다', () => {
    const rows = [
      HEADER,
      ['선수1', '1:12', '5', '2', '6'],
      ['', '', '', '', ''],
      ['선수3', '1:20', '4', '2', '5'],
    ]

    const session = parseSession('2025-05-16', rows, buildPlayers(), buildEvents())
    expect(session.entries.map((e) => e.playerId)).toEqual([1, 3])
  })
})
