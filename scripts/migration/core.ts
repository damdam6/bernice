import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { parseGoals } from '../../functions/lib/parse-goals'
import { mapHeaderToEvents } from '../../functions/lib/parse-session'
import { classifySheetTabs } from '../../functions/lib/sheetTabs'
import { buildRecordsResponse } from '../../functions/lib/build-records-response'
import { columnLetter } from '../../functions/lib/record-write'
import { quoteSheetName } from '../../functions/lib/sheetsApi'

// Full spreadsheets.get(includeGridData=true) response, not values-only exports.
export interface Value { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string; errorValue?: unknown }
export interface Cell { userEnteredValue?: Value; effectiveValue?: Value; formattedValue?: string; [key: string]: unknown }
export interface Protection { protectedRangeId: number; description?: string; range?: Record<string, number>; warningOnly?: boolean; editors?: { users: string[]; domainUsersCanEdit?: boolean; groups?: string[] }; [key: string]: unknown }
export interface Sheet {
  properties: { sheetId: number; title: string; sheetType?: string; gridProperties: { rowCount: number; columnCount: number }; [key: string]: unknown }
  data?: { startRow?: number; startColumn?: number; rowData?: { values?: Cell[] }[]; [key: string]: unknown }[]
  protectedRanges?: Protection[]
  merges?: Record<string, number>[]
  [key: string]: unknown
}
export interface Snapshot { spreadsheetId: string; sheets: Sheet[]; [key: string]: unknown }
export interface Edit { sheetId: number; title: string; row: number; column: number; before: Value; after: Value; display: string }
export interface Mapping { row: number; id: string; name: string; references: { sheetId: number; title: string; column: string; oldHeader: string; oldValue: Value }[] }
export interface Plan {
  version: 1; spreadsheetId: string; sourceHash: string; kind: 'migrate' | 'rollback';
  editors: string[]; mapping: Mapping[]; edits: Edit[]; protections: Protection[]; removeProtections: Protection[];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  return value
}
export const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
export function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(message)
}
export function cells(sheet: Sheet): Cell[][] {
  const result: Cell[][] = []
  for (const block of sheet.data ?? []) for (const [r, row] of (block.rowData ?? []).entries()) {
    const ri = (block.startRow ?? 0) + r
    result[ri] ??= []
    for (const [c, cell] of (row.values ?? []).entries()) result[ri][(block.startColumn ?? 0) + c] = cell
  }
  return Array.from({ length: result.length }, (_, r) => result[r] ?? [])
}
export function textRows(sheet: Sheet): string[][] {
  const rows = cells(sheet).map(row => Array.from({ length: row.length }, (_, c) => {
    const cell = row[c] ?? {}
    if (cell.effectiveValue?.errorValue) throw new Error(`${sheet.properties.title}: Google formula error`)
    const value = cell.effectiveValue ?? cell.userEnteredValue ?? {}
    if (value.formulaValue) throw new Error(`${sheet.properties.title}: formula evaluation missing`)
    return cell.formattedValue ?? String(value.stringValue ?? value.numberValue ?? value.boolValue ?? '')
  }))
  for (const row of rows) while (row.length && row.at(-1) === '') row.pop()
  while (rows.length && rows.at(-1)!.length === 0) rows.pop()
  return rows
}
export function records(snapshot: Snapshot) {
  const classified = classifySheetTabs(snapshot.sheets.map(s => s.properties.title))
  if (!classified.roster || !classified.goals || classified.unclassified.length) throw new Error('Missing/duplicate/unknown tab: explicit operator review required')
  const table = (name: string) => ({ name, values: textRows(snapshot.sheets.find(s => s.properties.title === name)!) })
  return buildRecordsResponse({ roster: table(classified.roster), goals: table(classified.goals), rounds: classified.rounds.map(r => ({ ...table(r.name), date: r.date })), unclassified: [] }, '2000-01-01T00:00:00.000Z')
}
export function headerFormula(id: string, goalsName: string): string {
  const q = id.replaceAll('"', '""'), sheet = quoteSheetName(goalsName)
  return `="id:${q}"&CHAR(10)&INDEX(${sheet}!A:A,MATCH(TRUE,ARRAYFORMULA(EXACT("${q}",${sheet}!G:G)),0))`
}
const rangeKey = (range?: Record<string, number>) => range ? { startRowIndex: 0, startColumnIndex: 0, ...range } : undefined
const editorKey = (editors?: Protection['editors']) => ({ users: [...(editors?.users ?? [])].sort(), groups: [...(editors?.groups ?? [])].sort(), domainUsersCanEdit: editors?.domainUsersCanEdit ?? false })

export function createPlan(snapshot: Snapshot, editors: string[]): Plan {
  if (!snapshot.spreadsheetId || !snapshot.sheets?.length) throw new Error('Full spreadsheet snapshot required')
  if (!editors.length || editors.some(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new Error('Explicit protection editors required')
  for (const sheet of snapshot.sheets) {
    if (sheet.properties.sheetType && sheet.properties.sheetType !== 'GRID') throw new Error('Unsupported sheet type')
  }
  records(snapshot) // Use production parser/calculators; never silently discard invalid rows.
  const goals = snapshot.sheets.find(s => s.properties.title.normalize('NFC') === '목표')!
  const parsed = parseGoals(textRows(goals))
  const plan: Plan = { version: 1, kind: 'migrate', spreadsheetId: snapshot.spreadsheetId, sourceHash: hash(snapshot), editors: [...new Set(editors)].sort(), mapping: [], edits: [], protections: [], removeProtections: [] }
  const addEdit = (sheet: Sheet, row: number, column: number, after: Value, display: string) => {
    const before = cells(sheet)[row]?.[column]?.userEnteredValue ?? {}
    if (isDeepStrictEqual(before, after)) return
    if ((sheet.merges ?? []).some(m => row >= (m.startRowIndex ?? 0) && row < m.endRowIndex && column >= (m.startColumnIndex ?? 0) && column < m.endColumnIndex)) throw new Error('Migration target overlaps merged cells')
    plan.edits.push({ sheetId: sheet.properties.sheetId, title: sheet.properties.title, row, column, before, after, display })
  }
  if (parsed.identityMode === 'legacy') addEdit(goals, 0, 6, { stringValue: '종목 ID' }, '종목 ID')
  for (const event of parsed.events) {
    const row = parsed.sheetRowById.get(event.id)!
    if (parsed.identityMode === 'id' && cells(goals)[row - 1]?.[6]?.userEnteredValue?.formulaValue) throw new Error('Persisted IDs must be literal strings, not formulas')
    // Persist EXACTLY what the running app returns, including gaps from blank rows.
    addEdit(goals, row - 1, 6, { stringValue: event.id }, event.id)
    plan.mapping.push({ row, id: event.id, name: event.name, references: [] })
  }
  const classified = classifySheetTabs(snapshot.sheets.map(s => s.properties.title))
  for (const round of classified.rounds) {
    const sheet = snapshot.sheets.find(s => s.properties.title === round.name)!
    const rows = textRows(sheet), header = rows[0]
    if (rows.some(row => row.length > header.length)) throw new Error(`${round.name}: score column without header`)
    for (const { event, columnIndex } of mapHeaderToEvents(header, parsed.events, round.name)) {
      plan.mapping.find(m => m.id === event.id)!.references.push({ sheetId: sheet.properties.sheetId, title: round.name, column: columnLetter(columnIndex + 1), oldHeader: header[columnIndex], oldValue: cells(sheet)[0]?.[columnIndex]?.userEnteredValue ?? {} })
      addEdit(sheet, 0, columnIndex, { formulaValue: headerFormula(event.id, goals.properties.title) }, `id:${event.id}\n${textRows(goals)[parsed.sheetRowById.get(event.id)! - 1][0]}`)
    }
  }
  const used = new Set(snapshot.sheets.flatMap(s => (s.protectedRanges ?? []).map(p => p.protectedRangeId)))
  const protect = (sheet: Sheet, range: Record<string, number>, description: string) => {
    const existing = (sheet.protectedRanges ?? []).filter(p => p.description === description)
    if (existing.length > 1) throw new Error('Duplicate migration protection')
    if (existing.length) {
      const p = existing[0]
      assertEqual(rangeKey(p.range), rangeKey(range), 'Migration protection range changed')
      if (p.warningOnly === true || (p.editors?.domainUsersCanEdit || p.editors?.groups?.length) || !isDeepStrictEqual([...(p.editors?.users ?? [])].sort(), plan.editors)) throw new Error('Migration protection policy changed')
      return
    }
    let id = 178000; while (used.has(id)) id++; used.add(id)
    plan.protections.push({ protectedRangeId: id, range, description, warningOnly: false, editors: { users: plan.editors } })
  }
  protect(goals, { sheetId: goals.properties.sheetId, startColumnIndex: 6, endColumnIndex: 7 }, 'bernice:event-identity:v1:ids')
  for (const round of classified.rounds) {
    const sheet = snapshot.sheets.find(s => s.properties.title === round.name)!
    protect(sheet, { sheetId: sheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1 }, 'bernice:event-identity:v1:header')
  }
  return plan
}

export function requests(plan: Plan, before: Snapshot): unknown[] {
  const result: unknown[] = []
  for (const sheet of before.sheets) {
    const required = Math.max(0, ...plan.edits.filter(e => e.sheetId === sheet.properties.sheetId).map(e => e.column + 1), ...plan.protections.filter(p => p.range?.sheetId === sheet.properties.sheetId).map(p => p.range?.endColumnIndex ?? 0))
    if (required > sheet.properties.gridProperties.columnCount) result.push({ appendDimension: { sheetId: sheet.properties.sheetId, dimension: 'COLUMNS', length: required - sheet.properties.gridProperties.columnCount } })
  }
  for (const edit of plan.edits) result.push({ updateCells: { start: { sheetId: edit.sheetId, rowIndex: edit.row, columnIndex: edit.column }, rows: [{ values: [{ userEnteredValue: edit.after }] }], fields: 'userEnteredValue' } })
  for (const p of plan.protections) result.push({ addProtectedRange: { protectedRange: p } })
  for (const p of plan.removeProtections) result.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } })
  return result
}

// Compare every untouched cell's entered value, effective value, formatting, validation,
// notes etc; normalize response-only fields only on cells this migration changes.
function preservation(snapshot: Snapshot, plan: Plan) {
  return snapshot.sheets.map(sheet => {
    const copy = structuredClone(sheet)
    const grid = cells(copy)
    for (const e of plan.edits.filter(e => e.sheetId === sheet.properties.sheetId)) {
      const cell = grid[e.row]?.[e.column]
      if (cell) for (const k of ['userEnteredValue', 'effectiveValue', 'formattedValue', 'effectiveFormat']) delete cell[k]
    }
    // Empty trailing cells/rows are inconsistently omitted by Sheets after an update.
    const clean = grid.map(row => {
      const arr = Array.from({ length: row.length }, (_, c) => row[c] ?? {})
      while (arr.length && Object.keys(arr.at(-1)!).length === 0) arr.pop()
      return arr
    })
    while (clean.length && clean.at(-1)!.length === 0) clean.pop()
    copy.data = (copy.data ?? []).map(({ rowData: _rows, ...metadata }) => metadata)
    // Preserve grid metadata; column append is validated separately.
    copy.properties.gridProperties.columnCount = 0
    const managed = new Set([...plan.protections, ...plan.removeProtections].map(p => p.protectedRangeId))
    copy.protectedRanges = (copy.protectedRanges ?? []).filter(p => !managed.has(p.protectedRangeId))
    return { sheet: copy, cells: clean }
  })
}
export function verify(before: Snapshot, after: Snapshot, plan: Plan): void {
  const { sheets: _beforeSheets, ...beforeMeta } = before
  const { sheets: _afterSheets, ...afterMeta } = after
  assertEqual(afterMeta, beforeMeta, 'Spreadsheet metadata changed')
  assertEqual(preservation(after, plan), preservation(before, plan), 'Untouched values/formulas/format/protection/structure changed')
  for (const sheet of before.sheets) {
    const actual = after.sheets.find(s => s.properties.sheetId === sheet.properties.sheetId)!
    const required = Math.max(sheet.properties.gridProperties.columnCount, ...plan.edits.filter(e => e.sheetId === sheet.properties.sheetId).map(e => e.column + 1))
    assertEqual(actual.properties.gridProperties.columnCount, required, 'Unexpected column count')
  }
  for (const edit of plan.edits) {
    const sheet = after.sheets.find(s => s.properties.sheetId === edit.sheetId)!
    const cell = cells(sheet)[edit.row]?.[edit.column] ?? {}
    assertEqual(cell.userEnteredValue ?? {}, edit.after, 'Written value/formula mismatch')
    if (edit.after.formulaValue && (cell.effectiveValue?.errorValue || cell.effectiveValue?.stringValue !== edit.display)) throw new Error('Google formula evaluation mismatch; keep writes frozen')
  }
  for (const p of plan.protections) {
    const actual = after.sheets.flatMap(s => s.protectedRanges ?? []).find(a => a.protectedRangeId === p.protectedRangeId)
    if (!actual || actual.warningOnly === true) throw new Error('Protection missing/only warning')
    assertEqual(rangeKey(actual.range), rangeKey(p.range), 'Protection range mismatch')
    assertEqual(editorKey(actual.editors), editorKey(p.editors), 'Protection editors mismatch')
  }
  for (const p of plan.removeProtections) if (after.sheets.some(s => s.protectedRanges?.some(a => a.protectedRangeId === p.protectedRangeId))) throw new Error('Rollback protection still present')
  assertEqual(records(after), recordsBefore(before, plan), 'Targets/scores/rankings/achievement/trends/personal bests changed')
}

// A rollback must also work when the migration header formula evaluates to #N/A.
// Infer ONLY the migrated header's ID from the reviewed mapping after checking its
// exact entered formula; all score/goal values still come from the live snapshot.
function recordsBefore(snapshot: Snapshot, plan: Plan) {
  if (plan.kind !== 'rollback') return records(snapshot)
  const readable = structuredClone(snapshot)
  for (const mapping of plan.mapping) for (const ref of mapping.references) {
    const edit = plan.edits.find(e => e.sheetId === ref.sheetId && e.row === 0 && columnLetter(e.column + 1) === ref.column)
    if (!edit) continue
    const sheet = readable.sheets.find(s => s.properties.sheetId === edit.sheetId)!
    const cell = cells(sheet)[0][edit.column]
    assertEqual(cell.userEnteredValue, edit.before, 'Rollback source header differs from reviewed formula')
    cell.effectiveValue = { stringValue: `id:${mapping.id}\n${mapping.name}` }
    cell.formattedValue = cell.effectiveValue.stringValue
  }
  return records(readable)
}

export function rollbackPlan(original: Snapshot, current: Snapshot, migration: Plan): Plan {
  if (migration.kind !== 'migrate' || hash(original) !== migration.sourceHash || original.spreadsheetId !== current.spreadsheetId) throw new Error('Backup/plan mismatch')
  // Refuse structural/lifecycle changes; score edits are allowed and never overwritten.
  const beforeRecords = records(original), nowRecords = recordsBefore(current, { ...migration, kind: 'rollback', edits: migration.edits.map(e => ({ ...e, before: e.after })) })
  assertEqual(nowRecords.events, beforeRecords.events, 'Goals changed since migration; manual recovery required')
  assertEqual(nowRecords.sessions.map(s => [s.date, s.eventIds]), beforeRecords.sessions.map(s => [s.date, s.eventIds]), 'Sessions changed; manual recovery required')
  const edits = migration.edits.map(e => {
    const s = current.sheets.find(s => s.properties.sheetId === e.sheetId && s.properties.title === e.title)
    if (!s) throw new Error('Tab moved/renamed; manual recovery required')
    assertEqual(cells(s)[e.row]?.[e.column]?.userEnteredValue ?? {}, e.after, 'Migration cell changed; manual recovery required')
    const old = original.sheets.find(s => s.properties.sheetId === e.sheetId)!
    return { ...e, before: e.after, after: e.before, display: textRows(old)[e.row]?.[e.column] ?? '' }
  })
  const protections = current.sheets.flatMap(s => s.protectedRanges ?? [])
  for (const p of migration.protections) {
    const actual = protections.find(a => a.protectedRangeId === p.protectedRangeId)
    if (!actual || hash({ range: rangeKey(actual.range), editors: editorKey(actual.editors), description: actual.description, warningOnly: actual.warningOnly ?? false }) !== hash({ range: rangeKey(p.range), editors: editorKey(p.editors), description: p.description, warningOnly: false })) throw new Error('Protection changed; manual recovery required')
  }
  return { ...migration, kind: 'rollback', sourceHash: hash(current), edits, protections: [], removeProtections: migration.protections }
}
