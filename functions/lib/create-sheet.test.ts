import { describe, expect, it } from 'vitest'
import type { EventDefinition, Player } from '../../shared/domain'
import { buildCreateSheetPlan } from './create-sheet'

const EVENTS: EventDefinition[] = [
  { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null },
  { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null },
]
// 실제 목표 탭 행 번호(헤더 다음 A2부터) — EVENTS 순서와 1:1 대응(parseGoals 계약과 동형).
const SHEET_ROW_BY_KEY = new Map([
  ['드리블셔틀런', 2],
  ['골밑슛', 3],
])

// id는 명단 데이터 행 위치(헤더 제외). 가나다 순서를 흐트러뜨린 채로 둬 정렬이 실제로 도는지 본다.
const PLAYERS: Player[] = [
  { id: 1, name: '다현', status: '활동' },
  { id: 2, name: '가은', status: '활동' },
  { id: 3, name: '나래', status: '탈퇴' },
  { id: 4, name: '나래', status: '활동' },
  { id: 5, name: '마루', status: '휴식' },
]

const BASE = {
  sessionDate: '2025-08-16',
  existingSheetIds: [0, 11, 22],
  rosterName: '버니스명단',
  goalsName: '목표',
  events: EVENTS,
  sheetRowByKey: SHEET_ROW_BY_KEY,
  players: PLAYERS,
}

function addSheetProps(requests: unknown[]) {
  return (requests[0] as { addSheet: { properties: Record<string, unknown> } }).addSheet.properties
}
function updateCellsRows(requests: unknown[]) {
  return (requests[1] as { updateCells: { rows: { values: { userEnteredValue: Record<string, string> }[] }[] } })
    .updateCells.rows
}

describe('buildCreateSheetPlan', () => {
  it('참가자를 가나다 정렬하고 이름/종목 참조 수식·빈 점수로 배치 요청을 만든다', () => {
    const result = buildCreateSheetPlan({ ...BASE, participantIds: [1, 2] }) // 다현, 가은

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 가나다: 가은(id2) → 다현(id1)
    expect(result.participants).toEqual([
      { id: 2, name: '가은' },
      { id: 1, name: '다현' },
    ])

    const props = addSheetProps(result.requests)
    expect(props.title).toBe('2025-08-16')
    expect(props.sheetId).toBe(23) // max(0,11,22)+1
    expect(props.gridProperties).toEqual({ frozenRowCount: 1, frozenColumnCount: 1 })
    expect(result.sheetId).toBe(23)

    const rows = updateCellsRows(result.requests)
    // 헤더: 이름 + 종목 참조 수식(목표 A2, A3)
    expect(rows[0].values).toEqual([
      { userEnteredValue: { stringValue: '이름' } },
      { userEnteredValue: { formulaValue: "='목표'!A2" } },
      { userEnteredValue: { formulaValue: "='목표'!A3" } },
    ])
    // 참가자 행: 이름 열만(점수 칸 없음), id+1 명단 행 참조
    expect(rows[1].values).toEqual([{ userEnteredValue: { formulaValue: "='버니스명단'!A3" } }]) // 가은 id2 → A3
    expect(rows[2].values).toEqual([{ userEnteredValue: { formulaValue: "='버니스명단'!A2" } }]) // 다현 id1 → A2
    expect(rows).toHaveLength(3) // 헤더 + 참가자 2명
    // updateCells는 값만 기록(서식 없음)
    expect((result.requests[1] as { updateCells: { fields: string } }).updateCells.fields).toBe('userEnteredValue')
  })

  it('탭 이름·참조는 quoteSheetName으로 quoting한다 (하이픈·특수문자 안전)', () => {
    const result = buildCreateSheetPlan({
      ...BASE,
      rosterName: "선수'단",
      goalsName: '목표',
      participantIds: [2],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const rows = updateCellsRows(result.requests)
    expect(rows[1].values[0]).toEqual({ userEnteredValue: { formulaValue: "='선수''단'!A3" } })
  })

  it('기존 sheetId가 없으면 새 탭 sheetId는 0에서 시작한다', () => {
    const result = buildCreateSheetPlan({ ...BASE, existingSheetIds: [], participantIds: [2] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sheetId).toBe(0)
  })

  it('중복 id는 dedupe해 한 행만 만든다', () => {
    const result = buildCreateSheetPlan({ ...BASE, participantIds: [2, 2, 1, 1] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.participants).toEqual([
      { id: 2, name: '가은' },
      { id: 1, name: '다현' },
    ])
  })

  it('동명이인은 id로 안정 정렬한다', () => {
    // 나래(id4, 활동) 하나만 활동. 동명이인 id3은 탈퇴라 대상 아님 → 여기선 id4만.
    const result = buildCreateSheetPlan({ ...BASE, participantIds: [4, 2] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 가은 → 나래
    expect(result.participants.map((p) => p.id)).toEqual([2, 4])
  })

  it('참가자 0명이면 no_participants', () => {
    const result = buildCreateSheetPlan({ ...BASE, participantIds: [] })
    expect(result).toEqual({ ok: false, code: 'no_participants' })
  })

  it('명단에 없는 id·비활동(탈퇴/휴식) id는 invalid_participants로 되돌린다', () => {
    const result = buildCreateSheetPlan({ ...BASE, participantIds: [2, 3, 5, 99] }) // 3=탈퇴,5=휴식,99=없음
    expect(result).toEqual({ ok: false, code: 'invalid_participants', invalidIds: [3, 5, 99] })
  })

  it('현역 종목만 헤더에 포함하고 종료 종목은 제외한다', () => {
    // 골밑슛이 종료(2025-08-01) — 드리블셔틀런만 현역.
    const events: EventDefinition[] = [
      EVENTS[0],
      { ...EVENTS[1], endSessionDate: '2025-08-01' },
    ]
    const result = buildCreateSheetPlan({ ...BASE, events, participantIds: [1, 2] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const rows = updateCellsRows(result.requests)
    // 헤더: 이름 + 현역 종목(드리블셔틀런)만 — 골밑슛 컬럼 없음
    expect(rows[0].values).toEqual([
      { userEnteredValue: { stringValue: '이름' } },
      { userEnteredValue: { formulaValue: "='목표'!A2" } },
    ])
  })

  it('종료 종목이 목표 탭 중간 행에 껴 있어도 현역 종목의 헤더 참조는 실제 행 번호를 가리킨다 (비연속)', () => {
    // 목표 탭 실제 배치: 1행 드리블셔틀런(현역) · 2행 45도패스캐치(종료, 헤더에서 제외) · 3행 골밑슛(현역).
    // 인덱스 기반(index+2)이었다면 필터 후 골밑슛이 A3 대신 A2를 잘못 가리켰을 것 — sheetRowByKey로 방지.
    const events: EventDefinition[] = [
      { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null },
      { key: '45도패스캐치', valueKind: 'count', target: '3', targetValue: 3, maxScore: 5, direction: '높을수록', endSessionDate: '2025-08-01' },
      { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null },
    ]
    const sheetRowByKey = new Map([
      ['드리블셔틀런', 2],
      ['45도패스캐치', 3],
      ['골밑슛', 4],
    ])
    const result = buildCreateSheetPlan({ ...BASE, events, sheetRowByKey, participantIds: [1] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const rows = updateCellsRows(result.requests)
    expect(rows[0].values).toEqual([
      { userEnteredValue: { stringValue: '이름' } },
      { userEnteredValue: { formulaValue: "='목표'!A2" } }, // 드리블셔틀런 → 실제 2행
      { userEnteredValue: { formulaValue: "='목표'!A4" } }, // 골밑슛 → 실제 4행 (3행 종료 종목 스킵)
    ])
  })
})
