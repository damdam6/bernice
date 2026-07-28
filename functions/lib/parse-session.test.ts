import { describe, expect, it } from 'vitest'
import { buildPlayersByName, parseSession } from './parse-session'
import type { EventDefinition, Player } from '../../shared/domain'

// docs/sheet-integration.html §02 예시를 본뜬 픽스처 — 드리블셔틀런(시간형) + 개수형 3종.
const HEADER = ['이름', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']

function buildEvents(): EventDefinition[] {
  return [
    { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null, exemptable: false },
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null, exemptable: false },
    { key: '자유투', valueKind: 'count', target: '2', targetValue: 2, maxScore: 5, direction: '높을수록', endSessionDate: null, exemptable: false },
    { key: '45도패스캐치', valueKind: 'count', target: '5', targetValue: 5, maxScore: 7, direction: '높을수록', endSessionDate: null, exemptable: false },
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
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayersByName(buildPlayers()), buildEvents())

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
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayersByName(buildPlayers()), buildEvents())

    const player3 = session.entries[2]
    expect(player3.scores['자유투']).toEqual({ status: 'exempt', value: null, display: null })
    expect(player3.participated).toBe(true)

    const player5 = session.entries[4]
    expect(player5.scores['45도패스캐치']).toEqual({ status: 'exempt', value: null, display: null })
  })

  it('한 종목만 빈칸이면 그 칸만 unmeasured고 participated는 true다', () => {
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayersByName(buildPlayers()), buildEvents())

    const player4 = session.entries[3]
    expect(player4.scores['드리블셔틀런']).toEqual({ status: 'unmeasured', value: null, display: null })
    expect(player4.scores['골밑슛']).toEqual({ status: 'recorded', value: 3, display: '3' })
    expect(player4.participated).toBe(true)
  })

  it('전 종목 미참여(트레일링 셀 생략으로 이름만 남은 행)는 모든 칸 unmeasured, participated는 false다', () => {
    const session = parseSession('2025-05-16', buildFullRows(), buildPlayersByName(buildPlayers()), buildEvents())

    const player7 = session.entries[6]
    expect(player7.playerId).toBe(7)
    expect(player7.participated).toBe(false)
    for (const event of buildEvents()) {
      expect(player7.scores[event.key]).toEqual({ status: 'unmeasured', value: null, display: null })
    }
  })

  it('개수 종목 셀에 시간형 값이 들어오면 invalid로 승격된다(valueKind 교차검증)', () => {
    const rows = [HEADER, ['선수1', '1:12', '1:15', '2', '6']] // 골밑슛(count)에 시간형 입력
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    const score = session.entries[0].scores['골밑슛']
    expect(score.status).toBe('invalid')
    if (score.status === 'invalid') {
      expect(score.display).toBe('1:15')
      expect(score.reason).toMatch(/형식/)
    }
  })

  it('시간 종목 셀에 개수형 값이 들어오면 invalid로 승격된다', () => {
    const rows = [HEADER, ['선수1', '72', '5', '2', '6']] // 드리블셔틀런(time)에 개수형 입력
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    expect(session.entries[0].scores['드리블셔틀런'].status).toBe('invalid')
  })

  it('normalizeScore가 이상값으로 판별하는 값(예: 1:75)은 그대로 invalid로 전달된다', () => {
    const rows = [HEADER, ['선수1', '1:75', '5', '2', '6']]
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    const score = session.entries[0].scores['드리블셔틀런']
    expect(score.status).toBe('invalid')
    if (score.status === 'invalid') {
      expect(score.display).toBe('1:75')
      expect(score.reason).toBeTruthy()
    }
  })

  it('회차 탭 이름 셀이 명단에 없는 이름이면 Error를 던진다', () => {
    const rows = [HEADER, ['모르는사람', '1:12', '5', '2', '6']]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers()), buildEvents())).toThrow(/명단에 없습니다/)
  })

  it('명단에 동명이인이 있으면 이름만으로 특정할 수 없어 Error를 던진다', () => {
    const rows = [HEADER, ['선수1', '1:12', '5', '2', '6']]
    const players: Player[] = [
      { id: 1, name: '선수1', status: '활동' },
      { id: 5, name: '선수1', status: '활동' }, // 동명이인 — 버니스명단에서 구분되지 않은 경우
    ]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(players), buildEvents())).toThrow(/동명이인/)
  })

  it('같은 회차 탭에 같은 사람이 두 행으로 나타나면 Error를 던진다', () => {
    const rows = [
      HEADER,
      ['선수1', '1:12', '5', '2', '6'],
      ['선수1', '1:14', '6', '1', '7'], // 같은 이름이 실수로 한 번 더 입력됨
    ]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())).toThrow(/중복으로 나타납니다/)
  })

  it('명단은 가입순, 회차 탭은 참가자 일부만 가나다순으로 나열돼도 이름 매칭으로 정상 파싱한다', () => {
    // 명단(가입순): 다솜(1), 가영(2), 바다(3), 나은(4) — 회차엔 이 중 3명만, 가나다순으로 입력
    const players: Player[] = [
      { id: 1, name: '다솜', status: '활동' },
      { id: 2, name: '가영', status: '활동' },
      { id: 3, name: '바다', status: '활동' },
      { id: 4, name: '나은', status: '활동' },
    ]
    const rows = [
      HEADER,
      ['가영', '1:12', '5', '2', '6'],
      ['나은', '1:14', '6', '1', '7'],
      ['바다', '1:20', '4', '2', '5'],
    ]

    const session = parseSession('2025-05-16', rows, buildPlayersByName(players), buildEvents())

    expect(session.entries.map((e) => ({ playerId: e.playerId, name: e.name }))).toEqual([
      { playerId: 2, name: '가영' },
      { playerId: 4, name: '나은' },
      { playerId: 3, name: '바다' },
    ])
  })

  it('이름 셀이 NFD(자모 분해)로 들어와도 NFC 정규화 후 일치하면 정상 통과한다', () => {
    const rows = [HEADER, ['선수1'.normalize('NFD'), '1:12', '5', '2', '6']]
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    expect(session.entries[0].name).toBe('선수1')
  })

  it('헤더 열 순서가 목표 탭 순서와 달라도 텍스트 매칭으로 정상 처리한다', () => {
    const shuffledHeader = ['이름', '골밑슛', '드리블셔틀런', '45도패스캐치', '자유투']
    const rows = [shuffledHeader, ['선수1', '5', '1:12', '6', '2']]
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    expect(session.entries[0].scores['드리블셔틀런']).toEqual({ status: 'recorded', value: 72, display: '1:12' })
    expect(session.entries[0].scores['골밑슛']).toEqual({ status: 'recorded', value: 5, display: '5' })
  })

  it('헤더 첫 칸이 "이름"이 아니면 Error를 던진다', () => {
    const rows = [['성명', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers()), buildEvents())).toThrow(/"이름"/)
  })

  it('알 수 없는 헤더 텍스트는 Error를 던진다', () => {
    const rows = [['이름', '드리블셔틀런', '골밑슛', '자유투', '윗몸일으키기']]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers()), buildEvents())).toThrow(/윗몸일으키기/)
  })

  it('목표 탭에 있어도 회차 헤더에 없는 종목은 에러가 아니라 "그 회차 미측정"이다 (V3 완화)', () => {
    const rows = [['이름', '드리블셔틀런', '골밑슛', '자유투'], ['선수1', '1:12', '5', '2']] // 45도패스캐치 컬럼 없음

    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers()), buildEvents())

    expect(session.eventKeys).toEqual(['드리블셔틀런', '골밑슛', '자유투'])
    expect(session.entries[0].scores).not.toHaveProperty('45도패스캐치')
  })

  it('헤더에 같은 종목이 중복되면 Error를 던진다', () => {
    const rows = [['이름', '드리블셔틀런', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers()), buildEvents())).toThrow(/중복/)
  })

  it('데이터 행 수가 명단보다 적은 것(신규 가입자 미포함)은 정상이다', () => {
    const rows = [HEADER, ['선수1', '1:12', '5', '2', '6']]
    const players = buildPlayers() // 명단은 7명, 이 회차엔 1명만 존재

    const session = parseSession('2025-05-16', rows, buildPlayersByName(players), buildEvents())
    expect(session.entries).toHaveLength(1)
  })

  it('완전히 빈 트레일링 행은 스킵되고 그 앞 행의 playerId는 밀리지 않는다', () => {
    const rows = [
      HEADER,
      ['선수1', '1:12', '5', '2', '6'],
      ['', '', '', '', ''], // 범위 조회가 한 행 더 가져온 빈 아티팩트
    ]
    const players = buildPlayers(['선수1', '선수2'])

    const session = parseSession('2025-05-16', rows, buildPlayersByName(players), buildEvents())
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

    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers()), buildEvents())
    expect(session.entries.map((e) => e.playerId)).toEqual([1, 3])
  })

  it('헤더 행조차 없는 빈 rows는 Error를 던진다', () => {
    expect(() => parseSession('2025-05-16', [], buildPlayersByName(buildPlayers()), buildEvents())).toThrow(/헤더 행조차 없음/)
  })

  it('이름 셀은 비어 있는데 점수는 입력돼 있으면 "이름 불일치"가 아니라 전용 사유로 Error를 던진다', () => {
    const rows = [HEADER, ['', '1:12', '5', '2', '6']]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers()), buildEvents())).toThrow(
      /이름 셀이 비어 있는데 점수가 입력돼 있습니다/,
    )
  })

  it('전 종목 exempt만 있어도 participated는 true다', () => {
    const rows = [HEADER, ['선수1', '면제', '면제', '면제', '면제']]
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    expect(session.entries[0].participated).toBe(true)
    for (const event of buildEvents()) {
      expect(session.entries[0].scores[event.key]).toEqual({ status: 'exempt', value: null, display: null })
    }
  })

  it('전 종목 invalid만 있어도 participated는 true다', () => {
    const rows = [HEADER, ['선수1', '1:75', '-1', '6.5', 'abc']]
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    expect(session.entries[0].participated).toBe(true)
    for (const event of buildEvents()) {
      expect(session.entries[0].scores[event.key].status).toBe('invalid')
    }
  })

  it('이름 셀 앞뒤 공백은 trim되어 명단과 매칭된다', () => {
    const rows = [HEADER, ['  선수1  ', '1:12', '5', '2', '6']]
    const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

    expect(session.entries[0].name).toBe('선수1')
  })

  describe('players 배열에 결번이 있는 경우 (명단 파서(#25)가 이름 없음·알 수 없는 상태값 행을 issues로 빼고 players에서 제외 — id는 원본 행 위치로 고정, functions/lib/roster.ts)', () => {
    it('결번이 있어도 이름 매칭에는 영향을 주지 않고, 빈 행은 스킵되며 그 뒤 행은 이름으로 정확히 매칭된다', () => {
      const players: Player[] = [
        { id: 1, name: '선수1', status: '활동' },
        { id: 3, name: '선수3', status: '활동' }, // id=2는 명단에서 상태값 오타 등으로 제외된 행
      ]
      const rows = [
        HEADER,
        ['선수1', '1:12', '5', '2', '6'],
        ['', '', '', '', ''], // 회차 탭 자체도 그 사람은 빈 행(참가자만 포맷이라 애초에 없을 수도 있음)
        ['선수3', '1:20', '4', '2', '5'],
      ]

      const session = parseSession('2025-05-16', rows, buildPlayersByName(players), buildEvents())
      expect(session.entries.map((e) => e.playerId)).toEqual([1, 3])
      expect(session.entries[1].name).toBe('선수3')
    })
  })

  // 이슈 #112 · PRD docs/prd-event-lifecycle.html §05 — 회차 탭 헤더가 "그 회차에 무엇을
  // 측정했나"의 정본이 되면서 생기는 계약. 종목 추가 전의 과거 회차, 종목 종료 후의 이후
  // 회차, 그냥 측정을 생략한 회차가 전부 이 한 규칙("헤더에 있는 종목만")으로 수용된다.
  describe('회차별 종목 서브셋 (V3 완화)', () => {
    // 목표는 4종목인데 이 회차엔 2종목만 측정 — 나머지 2종목은 아직 추가 전이거나 종료됐거나 생략됐다.
    const SUBSET_HEADER = ['이름', '골밑슛', '드리블셔틀런']

    it('eventKeys는 목표 탭 순서가 아니라 그 회차 헤더 순서를 그대로 담는다', () => {
      const rows = [SUBSET_HEADER, ['선수1', '5', '1:12']]

      const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

      expect(session.eventKeys).toEqual(['골밑슛', '드리블셔틀런'])
    })

    it('scores는 헤더 종목만 채우고 비측정 종목은 key 자체가 없다', () => {
      const rows = [SUBSET_HEADER, ['선수1', '5', '1:12']]

      const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

      expect(Object.keys(session.entries[0].scores)).toEqual(['골밑슛', '드리블셔틀런'])
      expect(session.entries[0].scores['골밑슛']).toEqual({ status: 'recorded', value: 5, display: '5' })
      expect(session.entries[0].scores['자유투']).toBeUndefined()
      expect(session.entries[0].scores['45도패스캐치']).toBeUndefined()
    })

    it('participated의 분모는 그 회차 측정 종목이다 — 헤더 종목이 전부 빈칸이면 false', () => {
      const rows = [SUBSET_HEADER, ['선수1', '', '']]

      const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

      expect(session.entries[0].participated).toBe(false)
    })

    it('participated의 분모는 그 회차 측정 종목이다 — 헤더 종목 중 하나라도 입력되면 true', () => {
      const rows = [SUBSET_HEADER, ['선수1', '', '1:12']]

      const session = parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

      expect(session.entries[0].participated).toBe(true)
    })

    it('참가자가 0명인 회차에서도 eventKeys로 측정 종목을 알 수 있다', () => {
      const session = parseSession('2025-05-16', [SUBSET_HEADER], buildPlayersByName(buildPlayers()), buildEvents())

      expect(session.entries).toEqual([])
      expect(session.eventKeys).toEqual(['골밑슛', '드리블셔틀런'])
    })

    it('완화된 것은 "헤더에 없음"뿐 — 목표에 없는 헤더(V1)·중복 헤더(V2)는 그대로 에러다', () => {
      const unknownHeader = [['이름', '골밑슛', '윗몸일으키기']]
      const duplicateHeader = [['이름', '골밑슛', '골밑슛']]
      const players = buildPlayersByName(buildPlayers())

      expect(() => parseSession('2025-05-16', unknownHeader, players, buildEvents())).toThrow(/윗몸일으키기/)
      expect(() => parseSession('2025-05-16', duplicateHeader, players, buildEvents())).toThrow(/중복/)
    })
  })

  // V4 — 종료 회차 이후 회차에 그 종목 컬럼이 있으면 데이터 모순(PRD §05 R2 위반).
  // endSessionDate는 목표 탭 5열 파싱(#111) 소관이라 여기서는 픽스처로 직접 주입한다.
  describe('종료 경계 검증 (V4)', () => {
    function eventsWithEnd(key: string, endSessionDate: string | null): EventDefinition[] {
      return buildEvents().map((event) => (event.key === key ? { ...event, endSessionDate } : event))
    }

    it('종료 회차보다 뒤인 회차 헤더에 종료 종목 컬럼이 있으면 Error를 던진다', () => {
      const rows = [['이름', '드리블셔틀런', '45도패스캐치'], ['선수1', '1:12', '6']]

      expect(() =>
        parseSession('2025-06-20', rows, buildPlayersByName(buildPlayers(['선수1'])), eventsWithEnd('45도패스캐치', '2025-05-16')),
      ).toThrow(/45도패스캐치/)
    })

    it('에러 메시지에 회차 날짜와 종료 회차를 모두 담아 어느 쪽을 고칠지 알려준다', () => {
      const rows = [['이름', '45도패스캐치']]

      expect(() =>
        parseSession('2025-06-20', rows, buildPlayersByName(buildPlayers()), eventsWithEnd('45도패스캐치', '2025-05-16')),
      ).toThrow(/2025-06-20[\s\S]*2025-05-16/)
    })

    it('종료 회차 그 자체(마지막 측정 회차)에 컬럼이 있는 것은 정상이다 — 경계 포함', () => {
      const rows = [['이름', '드리블셔틀런', '45도패스캐치'], ['선수1', '1:12', '6']]

      const session = parseSession(
        '2025-05-16',
        rows,
        buildPlayersByName(buildPlayers(['선수1'])),
        eventsWithEnd('45도패스캐치', '2025-05-16'),
      )

      expect(session.eventKeys).toContain('45도패스캐치')
      expect(session.entries[0].scores['45도패스캐치']).toEqual({ status: 'recorded', value: 6, display: '6' })
    })

    it('종료 회차 이후 회차라도 그 컬럼이 없으면 정상이다 — V3 완화로 자연 소멸한다', () => {
      const rows = [['이름', '드리블셔틀런', '골밑슛', '자유투'], ['선수1', '1:12', '5', '2']]

      const session = parseSession(
        '2025-06-20',
        rows,
        buildPlayersByName(buildPlayers(['선수1'])),
        eventsWithEnd('45도패스캐치', '2025-05-16'),
      )

      expect(session.eventKeys).not.toContain('45도패스캐치')
    })

    it('종료 회차가 아직 오지 않은 회차(현역 구간)는 컬럼이 있어도 정상이다', () => {
      const rows = [['이름', '45도패스캐치'], ['선수1', '6']]

      const session = parseSession(
        '2025-05-16',
        rows,
        buildPlayersByName(buildPlayers(['선수1'])),
        eventsWithEnd('45도패스캐치', '2025-06-20'),
      )

      expect(session.eventKeys).toEqual(['45도패스캐치'])
    })

    it('endSessionDate가 null인 현역 종목은 어느 회차에서도 V4에 걸리지 않는다', () => {
      const rows = [HEADER, ['선수1', '1:12', '5', '2', '6']]

      const session = parseSession('2099-12-31', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())

      expect(session.eventKeys).toHaveLength(4)
    })
  })

  it('헤더 중간에 빈 칸이 있으면(참조 수식 깨짐) 조용히 무시하지 않고 Error를 던진다', () => {
    // 헤더 셀은 전부 종목 참조 수식이라 빈 칸이면 수식이 깨졌다는 뜻이다 — V3 완화로
    // "종목 컬럼이 없는 것"은 정상이 됐지만 "있는데 비어 있는 것"은 여전히 에러여야 한다.
    const header = ['이름', '드리블셔틀런', '', '골밑슛', '자유투', '45도패스캐치']
    const rows = [header, ['선수1', '1:12', '', '5', '2', '6']]

    expect(() => parseSession('2025-05-16', rows, buildPlayersByName(buildPlayers(['선수1'])), buildEvents())).toThrow(
      /비어 있습니다/,
    )
  })
})
