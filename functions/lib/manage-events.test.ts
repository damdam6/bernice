import { describe, expect, it } from 'vitest'
import { buildEventPlan, parseEventCommand } from './manage-events'
import { buildRecordsResponse } from './build-records-response'
import { buildCreateSheetPlan } from './create-sheet'
import { parseGoals } from './parse-goals'
import type { SheetRawBundle } from './sheetsApi'
const header = ['종목', '목표', '만점', '방향', '종료 회차', '면제 가능', '종목 ID']
const create = { action: 'create', name: '골밑슛', target: '7', maxScore: 10, valueKind: 'count', direction: '높을수록', exemptable: false }
function bundle(): SheetRawBundle {
  return { roster: { name: '버니스명단', values: [['이름', '상태'], ['선수', '활동']] },
    goals: { name: '목표', values: [header, ['골밑슛', '5', '10', '높을수록', '', '', 'old']] },
    rounds: [{ name: '2025-05-16', date: new Date('2025-05-16'), values: [['이름', 'id:old\n골밑슛'], ['선수', '6']] }], unclassified: [] }
}
describe('종목 관리', () => {
  it.each([
    { target: '1:75', valueKind: 'time', maxScore: null }, { target: '-1' }, { target: '1.5' }, { target: '11' },
    { target: '3', valueKind: 'time', maxScore: null }, { maxScore: -1 }, { exemptable: undefined }, { name: '\n' },
    { direction: 'up' }, { valueKind: 'time', target: '1:15' },
  ])('잘못된 신규 기준을 거절한다: %j', (invalid) => expect(() => parseEventCommand({ ...create, ...invalid })).toThrow())
  it('시간 목표를 허용한다', () => expect(parseEventCommand({ ...create, target: '1:15', valueKind: 'time', maxScore: null, direction: '낮을수록' })).toMatchObject({ target: '1:15' }))
  it('목표와 기록을 보존하며 종료 → 동명 신규 등록 → 새 회차 대상으로 이어진다', () => {
    const b = bundle()
    const before = buildRecordsResponse(b, 'test')
    const end = buildEventPlan(b, 5, parseEventCommand({ action: 'end', id: 'old', endSessionDate: '2025-05-16' }), 'unused')
    expect(end.requests).toEqual([{ updateCells: { start: { sheetId: 5, rowIndex: 1, columnIndex: 4 }, rows: [{ values: [{ userEnteredValue: { stringValue: '2025-05-16' } }] }], fields: 'userEnteredValue' } }])
    b.goals!.values[1][4] = '2025-05-16'
    const plan = buildEventPlan(b, 5, parseEventCommand(create), 'new')
    expect(plan.requests).toHaveLength(1)
    const append = plan.requests[0] as { appendCells: { rows: { values: { userEnteredValue: { stringValue: string } }[] }[] } }
    b.goals!.values.push(append.appendCells.rows[0].values.map((v) => v.userEnteredValue.stringValue))
    const after = buildRecordsResponse(b, 'test')
    expect(after.sessions).toEqual(before.sessions)
    expect(after.rankings).toEqual(before.rankings)
    expect(after.players[0].personalBests).toEqual(before.players[0].personalBests)
    const { events, sheetRowById, identityMode } = parseGoals(b.goals!.values)
    const next = buildCreateSheetPlan({ sessionDate: '2026-09-30', existingSheetIds: [5], rosterName: '버니스명단', goalsName: '목표', events, sheetRowById, identityMode,
      players: [{ id: 1, name: '선수', status: '활동' }], participantIds: [1] })
    expect(next.ok).toBe(true)
    expect(JSON.stringify(next)).toContain('id:new')
    expect(JSON.stringify(next)).not.toContain('id:old')
  })
  it('나중 회차의 빈 기록 열도 보존한다', () => {
    const b = bundle()
    b.rounds.push({ name: '2026-09-30', date: new Date('2026-09-30'), values: [['이름', 'id:old'], ['선수', '']] })
    expect(() => buildEventPlan(b, 5, parseEventCommand({ action: 'end', id: 'old', endSessionDate: '2025-05-16' }), 'new')).toThrow('마지막 측정')
  })
  it.each(['2024-01-01', '2026-09-30', 'invalid'])('없는/마지막이 아닌 종료 날짜 %s를 거절한다', (endSessionDate) => {
    expect(() => buildEventPlan(bundle(), 5, parseEventCommand({ action: 'end', id: 'old', endSessionDate }), 'new')).toThrow()
  })
  it('이름 헤더가 남으면 동명 등록 전 이전을 요구한다', () => {
    const b = bundle(); b.rounds[0].values[0][1] = '골밑슛'
    expect(() => buildEventPlan(b, 5, parseEventCommand(create), 'new')).toThrow('헤더')
  })
  it('미측정 종목은 최신 실제 회차로 종료한다', () => {
    const b = bundle(); b.goals!.values.push(['패스', '3', '5', '높을수록', '', '', 'unused'])
    expect(buildEventPlan(b, 5, parseEventCommand({ action: 'end', id: 'unused', endSessionDate: '2025-05-16' }), 'new').eventId).toBe('unused')
  })
  it('이미 종료된 종목의 목표·종료일 변경은 허용하지 않는다', () => {
    const b = bundle(); b.goals!.values[1][4] = '2025-05-16'
    expect(() => buildEventPlan(b, 5, parseEventCommand({ action: 'end', id: 'old', endSessionDate: '2025-05-16' }), 'new')).toThrow('이미 종료')
    expect(() => parseEventCommand({ action: 'edit', id: 'old', target: '7' })).toThrow()
  })
})
