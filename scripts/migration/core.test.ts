import { describe, it, expect, vi } from 'vitest'
import { createPlan, verify, rollbackPlan, records, cells, hash, requests, headerFormula, type Snapshot, type Cell, type Plan } from './core'
import { applyPlan } from './io'
import { buildCreateSheetPlan } from '../../functions/lib/create-sheet'
import { parseGoals } from '../../functions/lib/parse-goals'
import { buildWritePlan, mapHeaderToEvents } from '../../functions/lib/record-write'
import { textRows } from './core'

const editors = ['owner@example.test', 'service@example.test']
const cell = (s: string): Cell => ({ userEnteredValue: { stringValue: s }, effectiveValue: { stringValue: s }, formattedValue: s })
function fixture(): Snapshot {
  const tables = [
    { title: '버니스명단', rows: [['이름', '상태'], ['선수A', '활동'], ['선수B', '활동'], ['선수C', '탈퇴']] },
    { title: '목표', rows: [['종목', '목표', '만점', '방향', '종료 회차', '면제 가능'], ['슛', '3', '5', '높을수록', '2026-06-01', ''], [], ['달리기', '0:20', '', '낮을수록', '', '가능']] },
    { title: '2026-06-01', rows: [['이름', '달리기', '슛'], ['선수A', '0:19', '4'], ['선수B', '면제', '2'], ['선수C', '0:22', '1']] },
    { title: '2026-09-01', rows: [['이름', '달리기'], ['선수A', '0:18'], ['선수B', '0:23']] },
  ]
  return { spreadsheetId: 'synthetic-only', properties: { locale: 'ko_KR' }, sheets: tables.map((t, i) => ({ properties: { sheetId: i, title: t.title, sheetType: 'GRID', gridProperties: { rowCount: 100, columnCount: 6 } }, data: [{ rowData: t.rows.map(row => ({ values: row.map(cell) })) }], protectedRanges: [{ protectedRangeId: 10 + i, range: { sheetId: i, startColumnIndex: 0, endColumnIndex: 1 }, warningOnly: false, editors: { users: editors } }] })) }
}
// This simulator is ONLY a transport fixture, NOT a Google formula evaluator.
function simulate(before: Snapshot, plan: Plan): Snapshot {
  const after = structuredClone(before)
  for (const e of plan.edits) {
    const s = after.sheets.find(s => s.properties.sheetId === e.sheetId)!
    const rows = s.data![0].rowData!
    rows[e.row] ??= { values: [] }; rows[e.row].values ??= []
    const prior = rows[e.row].values![e.column] ?? {}
    rows[e.row].values![e.column] = { ...prior, userEnteredValue: e.after, effectiveValue: e.after.formulaValue ? { stringValue: e.display } : e.after, formattedValue: e.display }
    s.properties.gridProperties.columnCount = Math.max(s.properties.gridProperties.columnCount, e.column + 1)
  }
  for (const p of plan.protections) after.sheets.find(s => s.properties.sheetId === p.range!.sheetId)!.protectedRanges!.push(structuredClone(p))
  for (const s of after.sheets) s.protectedRanges = s.protectedRanges?.filter(p => !plan.removeProtections.some(r => r.protectedRangeId === p.protectedRangeId))
  return after
}
function set(s: Snapshot, tab: number, r: number, c: number, value: string) { s.sheets[tab].data![0].rowData![r].values![c] = cell(value) }

describe('#178 migration', () => {
  it('maps original rows (including holes), retired events and physical columns; preserves complete API output and raw cells', () => {
    const before = fixture(), plan = createPlan(before, editors), after = simulate(before, plan)
    expect(plan.mapping.map(m => [m.row, m.id])).toEqual([[2, 'legacy-row-2'], [4, 'legacy-row-4']])
    expect(plan.mapping[0].references.map(r => r.column)).toEqual(['C'])
    expect(plan.mapping[1].references.map(r => r.column)).toEqual(['B', 'B'])
    expect(plan.edits.every(e => e.sheetId === 1 ? e.column === 6 : e.row === 0 && e.column > 0)).toBe(true)
    expect(requests(plan, before)[0]).toEqual({ appendDimension: { sheetId: 1, dimension: 'COLUMNS', length: 1 } })
    expect(() => verify(before, after, plan)).not.toThrow()
    expect(records(after)).toEqual(records(before))
    expect(cells(after.sheets[2]).slice(1)).toEqual(cells(before.sheets[2]).slice(1))
    expect(createPlan(after, editors).edits).toEqual([])
    expect(createPlan(after, editors).protections).toEqual([])
  })
  it('preserves raw numeric cells, score formulas, formatting and existing protections', () => {
    const before = fixture()
    before.sheets[2].data![0].rowData![1].values![2] = { userEnteredValue: { formulaValue: '=2+2' }, effectiveValue: { numberValue: 4 }, formattedValue: '4', userEnteredFormat: { numberFormat: { type: 'NUMBER' } }, note: 'original note' }
    const plan = createPlan(before, editors), after = simulate(before, plan)
    verify(before, after, plan)
    expect(after.sheets[2].protectedRanges![0]).toEqual(before.sheets[2].protectedRanges![0])
    after.sheets[2].data![0].rowData![1].values![2].userEnteredValue = { numberValue: 4 }
    expect(() => verify(before, after, plan)).toThrow(/Untouched/)
  })
  it.each(['unknown', 'duplicate', 'missing', 'ambiguous', 'orphan', 'formula-error', 'merged', 'partial-id', 'duplicate-id', 'unknown-tab'])('fails closed for %s', mode => {
    const s = fixture()
    if (mode === 'unknown') set(s, 2, 0, 1, 'unknown')
    if (mode === 'duplicate') set(s, 2, 0, 2, '달리기')
    if (mode === 'missing') set(s, 2, 0, 1, '')
    if (mode === 'ambiguous') set(s, 1, 3, 0, '슛')
    if (mode === 'orphan') set(s, 2, 1, 3, '4')
    if (mode === 'formula-error') s.sheets[2].data![0].rowData![0].values![1].effectiveValue = { errorValue: { type: 'REF' } }
    if (mode === 'merged') s.sheets[2].merges = [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 }]
    if (mode === 'partial-id') set(s, 1, 0, 6, '종목 ID')
    if (mode === 'duplicate-id') { set(s, 1, 0, 6, '종목 ID'); set(s, 1, 1, 6, 'same'); set(s, 1, 3, 6, 'same') }
    if (mode === 'unknown-tab') s.sheets[3].properties.title = 'not-a-session'
    expect(() => createPlan(s, editors)).toThrow()
  })
  it('handles mixed ID/name headers and persisted aliases without reissuing IDs', () => {
    const s = fixture()
    set(s, 1, 0, 6, '종목 ID'); set(s, 1, 0, 7, '이전 종목명')
    s.sheets[1].properties.gridProperties.columnCount = 8
    set(s, 1, 1, 6, 'legacy-row-2'); set(s, 1, 3, 6, 'legacy-row-4')
    set(s, 1, 3, 7, '달리기 이전'); set(s, 2, 0, 1, '달리기 이전'); set(s, 3, 0, 1, 'id:legacy-row-4\n옛이름')
    const plan = createPlan(s, editors)
    expect(plan.edits.every(e => e.sheetId !== 1)).toBe(true)
    verify(s, simulate(s, plan), plan)
  })
  it('accepts same-name/different-ID columns only when already explicitly identified', () => {
    const s = fixture()
    set(s, 1, 0, 6, '종목 ID'); set(s, 1, 1, 6, 'legacy-row-2'); set(s, 1, 3, 6, 'legacy-row-4')
    set(s, 1, 1, 0, '테스트'); set(s, 1, 3, 0, '테스트')
    set(s, 2, 0, 1, 'id:legacy-row-4\n테스트'); set(s, 2, 0, 2, 'id:legacy-row-2\n테스트'); set(s, 3, 0, 1, 'id:legacy-row-4\n테스트')
    s.sheets[1].properties.gridProperties.columnCount = 7
    const plan = createPlan(s, editors); verify(s, simulate(s, plan), plan)
    set(s, 2, 0, 1, '테스트'); expect(() => createPlan(s, editors)).toThrow(/모호/)
  })
  it.each(['score', 'target', 'format', 'protection', 'header-evaluation', 'global'])('postcheck detects changed %s', mode => {
    const s = fixture(), p = createPlan(s, editors), a = simulate(s, p)
    if (mode === 'score') set(a, 2, 1, 2, '5')
    if (mode === 'target') set(a, 1, 1, 1, '4')
    if (mode === 'format') a.sheets[2].data![0].rowData![0].values![1].userEnteredFormat = { textFormat: { bold: true } }
    if (mode === 'protection') a.sheets[1].protectedRanges![1].warningOnly = true
    if (mode === 'header-evaluation') a.sheets[2].data![0].rowData![0].values![1].effectiveValue = { errorValue: { type: 'N_A' } }
    if (mode === 'global') a.properties = { locale: 'en_US' }
    expect(() => verify(s, a, p)).toThrow()
  })
  it('rollback preserves subsequent score edits and original header formulas, removes only added protections', () => {
    const s = fixture()
    s.sheets[2].data![0].rowData![0].values![2].userEnteredValue = { formulaValue: "='목표'!A2" }
    const p = createPlan(s, editors), a = simulate(s, p)
    set(a, 2, 1, 2, '5')
    const undo = rollbackPlan(s, a, p), restored = simulate(a, undo)
    verify(a, restored, undo)
    expect(cells(restored.sheets[2])[1][2].userEnteredValue).toEqual({ stringValue: '5' })
    expect(cells(restored.sheets[2])[0][2].userEnteredValue).toEqual({ formulaValue: "='목표'!A2" })
    expect(restored.sheets[2].protectedRanges).toEqual(s.sheets[2].protectedRanges)
    expect(undo.edits.some(e => e.sheetId !== 1 && e.row > 0)).toBe(false)
    set(a, 1, 1, 1, '4'); expect(() => rollbackPlan(s, a, p)).toThrow(/Goals changed/)
  })
  it('rollback remains available after Google reports a migrated header formula error', () => {
    const before = fixture(), p = createPlan(before, editors), after = simulate(before, p)
    after.sheets[2].data![0].rowData![0].values![1].effectiveValue = { errorValue: { type: 'N_A' } }
    after.sheets[2].data![0].rowData![0].values![1].formattedValue = '#N/A'
    expect(() => verify(before, after, p)).toThrow()
    const undo = rollbackPlan(before, after, p)
    expect(() => verify(after, simulate(after, undo), undo)).not.toThrow()
  })
  it('accepts equivalent omitted default protection indexes and reordered editors', () => {
    const before = fixture(), p = createPlan(before, editors), after = simulate(before, p)
    for (const protection of after.sheets.flatMap(s => s.protectedRanges ?? []).filter(p => p.protectedRangeId >= 178000)) {
      if (protection.range?.startRowIndex === 0) delete protection.range.startRowIndex
      protection.editors!.users.reverse()
      protection.editors!.groups = []
      protection.editors!.domainUsersCanEdit = false
    }
    expect(() => verify(before, after, p)).not.toThrow()
    expect(createPlan(after, editors).protections).toEqual([])
    expect(() => rollbackPlan(before, after, p)).not.toThrow()
  })
  it('refuses formula-driven persisted IDs and changed managed protection policy', () => {
    const before = fixture(), p = createPlan(before, editors), after = simulate(before, p)
    after.sheets[1].data![0].rowData![1].values![6].userEnteredValue = { formulaValue: '=CONCAT("legacy-row-",2)' }
    expect(() => createPlan(after, editors)).toThrow(/literal/)
    const protectedAfter = simulate(before, p)
    protectedAfter.sheets[1].protectedRanges![1].editors!.groups = ['group@example.test']
    expect(() => createPlan(protectedAfter, editors)).toThrow(/policy/)
  })
  it('renaming leaves records and physical write paths associated by ID; new round gets ID lookup formulas', () => {
    const s = fixture(), p = createPlan(s, editors), a = simulate(s, p)
    const old = records(a)
    set(a, 1, 3, 0, '속도 측정')
    expect(records(a).sessions).toEqual(old.sessions)
    const parsed = parseGoals(textRows(a.sheets[1]))
    const columns = mapHeaderToEvents(textRows(a.sheets[3])[0], parsed.events, '2026-09-01')
    expect(buildWritePlan('2026-09-01', 2, columns, { 'legacy-row-4': '0:17' }).values).toEqual([['0:17']])
    const next = buildCreateSheetPlan({ ...parsed, sessionDate: '2026-12-01', existingSheetIds: [0, 1, 2, 3], rosterName: '버니스명단', goalsName: '목표', players: [{ id: 1, name: '선수A', status: '활동' }], participantIds: [1] })
    expect(next.ok).toBe(true)
    expect(JSON.stringify(next)).toContain(JSON.stringify(headerFormula('legacy-row-4', '목표')).slice(1, -1))
  })
  it('escapes opaque ID quotes and sheet apostrophes in lookup formula', () => {
    expect(headerFormula('Ab"*?', "목'표")).toContain('EXACT("Ab""*?",\'목\'\'표\'!G:G)')
  })
  it('stale source blocks all writes and durable intent creation', async () => {
    const s = fixture(), p = createPlan(s, editors), changed = structuredClone(s)
    set(changed, 2, 1, 2, '5')
    const client = { read: vi.fn().mockResolvedValue(changed), write: vi.fn() }, save = vi.fn()
    await expect(applyPlan(client, s, p, save)).rejects.toThrow(/Source changed/)
    expect(client.write).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled()
  })
  it('performs one atomic write only after durable intent; readback must pass', async () => {
    const s = fixture(), p = createPlan(s, editors), a = simulate(s, p), sequence: string[] = []
    const client = { read: vi.fn().mockResolvedValueOnce(s).mockResolvedValueOnce(a), write: vi.fn(async () => { sequence.push('write') }) }
    await applyPlan(client, s, p, async name => { sequence.push(name) })
    expect(sequence).toEqual(['apply-intent.json', 'write', 'after.json', 'verification.json'])
    expect(client.write).toHaveBeenCalledTimes(1)
    expect(hash(s)).toBe(p.sourceHash)
  })
  it('never retries ambiguous write failures or writes without a saved intent', async () => {
    const s = fixture(), p = createPlan(s, editors)
    const client = { read: vi.fn().mockResolvedValue(s), write: vi.fn().mockRejectedValue(new Error('timeout')) }
    await expect(applyPlan(client, s, p, async () => {})).rejects.toThrow('timeout')
    expect(client.write).toHaveBeenCalledTimes(1)
    client.write.mockClear()
    await expect(applyPlan(client, s, p, async () => { throw new Error('disk full') })).rejects.toThrow('disk full')
    expect(client.write).not.toHaveBeenCalled()
  })
})
