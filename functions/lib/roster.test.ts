import { describe, expect, it } from 'vitest'
import { parseRoster } from './roster'

const HEADER = ['이름', '상태']

describe('parseRoster', () => {
  it('정상 21명 — 전원 활동 상태를 id 1~21로 순서대로 파싱한다', () => {
    const rows = [
      HEADER,
      ...Array.from({ length: 21 }, (_, i) => [`선수${i + 1}`, '활동']),
    ]

    const result = parseRoster(rows)

    expect(result.issues).toEqual([])
    expect(result.players).toHaveLength(21)
    expect(result.players.map((p) => p.id)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1))
    expect(result.players[0]).toEqual({ id: 1, name: '선수1', status: '활동' })
    expect(result.players[20]).toEqual({ id: 21, name: '선수21', status: '활동' })
  })

  it('상태 4종 혼합 — 활동/탈퇴/비대상/휴식이 모두 players에 포함된다', () => {
    const rows = [
      HEADER,
      ['선수1', '활동'],
      ['선수2', '탈퇴'],
      ['선수3', '비대상'],
      ['선수4', '휴식'],
    ]

    const result = parseRoster(rows)

    expect(result.issues).toEqual([])
    expect(result.players).toEqual([
      { id: 1, name: '선수1', status: '활동' },
      { id: 2, name: '선수2', status: '탈퇴' },
      { id: 3, name: '선수3', status: '비대상' },
      { id: 4, name: '선수4', status: '휴식' },
    ])
  })

  it('빈 행 케이스 — 완전 빈 행은 건너뛰고, 이후 행의 id는 원래 시트 행 위치를 유지한다', () => {
    const rows = [
      HEADER,
      ['선수1', '활동'],
      ['선수2', '활동'],
      ['', ''], // 3번째 데이터 행 — 완전 빈 행
      ['선수4', '활동'],
    ]

    const result = parseRoster(rows)

    expect(result.issues).toEqual([])
    expect(result.players).toEqual([
      { id: 1, name: '선수1', status: '활동' },
      { id: 2, name: '선수2', status: '활동' },
      { id: 4, name: '선수4', status: '활동' }, // 3이 아니라 4 — 연속 카운트로 당겨지지 않음
    ])
  })

  it('빈 행이 셀 자체가 생략된 짧은 배열([])로 와도 동일하게 건너뛴다', () => {
    const rows = [HEADER, ['선수1', '활동'], [], ['선수3', '활동']]

    const result = parseRoster(rows)

    expect(result.issues).toEqual([])
    expect(result.players.map((p) => p.id)).toEqual([1, 3])
  })

  it('이름 없음(상태만 있음) — issues에 원본 셀 값과 함께 기록되고 players에서 제외된다', () => {
    const rows = [HEADER, ['선수1', '활동'], ['', '활동']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([{ id: 1, name: '선수1', status: '활동' }])
    expect(result.issues).toEqual([{ rowIndex: 2, reason: '이름 없음', rawName: '', rawStatus: '활동' }])
  })

  it('상태 없음(이름만 있음) — issues에 원본 셀 값과 함께 기록되고 players에서 제외된다', () => {
    const rows = [HEADER, ['선수1', '']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([])
    expect(result.issues).toEqual([{ rowIndex: 1, reason: '상태 없음', rawName: '선수1', rawStatus: '' }])
  })

  it('상태 열 자체가 생략된 짧은 행도 상태 없음으로 처리한다', () => {
    const rows = [HEADER, ['선수1']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([])
    expect(result.issues).toEqual([{ rowIndex: 1, reason: '상태 없음', rawName: '선수1', rawStatus: '' }])
  })

  it('알 수 없는 상태값(4종 밖·오타) — issues에 사유·원본 이름과 함께 기록되고 players에서 제외된다', () => {
    const rows = [HEADER, ['선수1', '활동중']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([])
    expect(result.issues).toEqual([
      { rowIndex: 1, reason: '알 수 없는 상태값: "활동중"', rawName: '선수1', rawStatus: '활동중' },
    ])
  })

  it('이상값 행 뒤 유효 행 — 이상값 행이 issues로 빠져도 다음 유효 행의 id는 원래 시트 행 위치를 유지한다', () => {
    const rows = [HEADER, ['선수1', '활동'], ['선수2', '활동중'], ['선수3', '활동']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([
      { id: 1, name: '선수1', status: '활동' },
      { id: 3, name: '선수3', status: '활동' }, // 2가 아니라 3 — 이상값 행(2)만큼 당겨지지 않음
    ])
    expect(result.issues).toEqual([
      { rowIndex: 2, reason: '알 수 없는 상태값: "활동중"', rawName: '선수2', rawStatus: '활동중' },
    ])
  })

  it('빈 행과 이상값 행이 섞여도 각각 독립적으로 처리되고 id가 어긋나지 않는다', () => {
    const rows = [
      HEADER,
      ['선수1', '활동'],
      ['', ''], // 빈 행 — 조용히 스킵
      ['선수3', '오타상태'], // 이상값 행 — issues로
      ['선수4', '활동'],
    ]

    const result = parseRoster(rows)

    expect(result.players).toEqual([
      { id: 1, name: '선수1', status: '활동' },
      { id: 4, name: '선수4', status: '활동' },
    ])
    expect(result.issues).toEqual([
      { rowIndex: 3, reason: '알 수 없는 상태값: "오타상태"', rawName: '선수3', rawStatus: '오타상태' },
    ])
  })

  it('동명이인 — 행 위치가 신원이므로 이름이 같아도 서로 다른 id로 각각 보존된다', () => {
    const rows = [HEADER, ['선수5', '활동'], ['선수5', '휴식']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([
      { id: 1, name: '선수5', status: '활동' },
      { id: 2, name: '선수5', status: '휴식' },
    ])
  })

  it('이름 NFD(자모 분해) 입력도 NFC로 정규화해 반환한다', () => {
    const nfdName = '선수1'.normalize('NFD')
    expect(nfdName).not.toBe('선수1')

    const rows = [HEADER, [nfdName, '활동']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([{ id: 1, name: '선수1', status: '활동' }])
  })

  it('이름·상태 앞뒤 공백은 트림되어 저장된다', () => {
    const rows = [HEADER, ['  선수1  ', '  활동  ']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([{ id: 1, name: '선수1', status: '활동' }])
  })

  it('헤더만 있고 데이터 행이 없으면 빈 결과를 돌려준다', () => {
    expect(parseRoster([HEADER])).toEqual({ players: [], issues: [] })
  })

  it('완전히 빈 배열을 넣으면 헤더 자체가 없다는 뜻이므로 throw한다', () => {
    expect(() => parseRoster([])).toThrow('버니스명단 헤더 첫 열이 "이름"이 아닙니다')
  })

  it('헤더 첫 열이 "이름"이 아니면 throw한다 (데이터 전용 범위를 잘못 넘긴 경우 방어)', () => {
    // A2:B처럼 헤더를 뺀 범위를 실수로 넘기면 첫 데이터 행이 헤더로 오인되는 걸 막는다 —
    // 그렇지 않으면 선수1이 조용히 사라지고 이후 전원의 id가 1씩 밀린다.
    const rows = [['선수1', '활동'], ['선수2', '활동']]

    expect(() => parseRoster(rows)).toThrow('버니스명단 헤더 첫 열이 "이름"이 아닙니다: "선수1"')
  })

  it('헤더 첫 열 오타("성명" 등)도 throw한다', () => {
    const rows = [['성명', '상태'], ['선수1', '활동']]

    expect(() => parseRoster(rows)).toThrow('버니스명단 헤더 첫 열이 "이름"이 아닙니다: "성명"')
  })
})
