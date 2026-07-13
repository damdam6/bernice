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

  it('이름 없음(상태만 있음) — issues에 기록되고 players에서 제외된다', () => {
    const rows = [HEADER, ['선수1', '활동'], ['', '활동']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([{ id: 1, name: '선수1', status: '활동' }])
    expect(result.issues).toEqual([{ rowIndex: 2, reason: '이름 없음' }])
  })

  it('상태 없음(이름만 있음) — issues에 기록되고 players에서 제외된다', () => {
    const rows = [HEADER, ['선수1', '']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([])
    expect(result.issues).toEqual([{ rowIndex: 1, reason: '상태 없음' }])
  })

  it('상태 열 자체가 생략된 짧은 행도 상태 없음으로 처리한다', () => {
    const rows = [HEADER, ['선수1']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([])
    expect(result.issues).toEqual([{ rowIndex: 1, reason: '상태 없음' }])
  })

  it('알 수 없는 상태값(4종 밖·오타) — issues에 사유와 함께 기록되고 players에서 제외된다', () => {
    const rows = [HEADER, ['선수1', '활동중']]

    const result = parseRoster(rows)

    expect(result.players).toEqual([])
    expect(result.issues).toEqual([{ rowIndex: 1, reason: '알 수 없는 상태값: "활동중"' }])
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

  it('완전히 빈 배열을 넣어도 죽지 않고 빈 결과를 돌려준다', () => {
    expect(parseRoster([])).toEqual({ players: [], issues: [] })
  })
})
