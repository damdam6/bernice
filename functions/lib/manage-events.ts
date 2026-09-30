import { isPlainObject } from '../../shared/is-plain-object'
import { isEventId } from '../../shared/event-identity'
import { normalizeScore } from '../../shared/normalize-score'
import { parseGoals } from './parse-goals'
import { buildRecordsResponse } from './build-records-response'
import type { SheetRawBundle } from './sheetsApi'

export class EventInputError extends Error {}
export type EventCommand =
  | { action: 'create'; name: string; target: string; maxScore: number | null; valueKind: 'count' | 'time'; direction: '높을수록' | '낮을수록'; exemptable: boolean }
  | { action: 'end'; id: string; endSessionDate: string }

export function parseEventCommand(raw: unknown): EventCommand {
  if (!isPlainObject(raw)) throw new EventInputError('JSON 입력이 필요합니다.')
  if (raw.action === 'end' && isEventId(raw.id) && typeof raw.endSessionDate === 'string') {
    return { action: 'end', id: raw.id, endSessionDate: raw.endSessionDate }
  }
  if (raw.action !== 'create') throw new EventInputError('지원하지 않는 종목 변경 요청입니다.')
  const { name, target, maxScore, valueKind, direction, exemptable } = raw
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || /[\x00-\x1f]/.test(name)) {
    throw new EventInputError('종목 이름은 1~100자의 한 줄로 입력해주세요.')
  }
  if (typeof target !== 'string' || (valueKind !== 'count' && valueKind !== 'time')) throw new EventInputError('목표와 측정 형식을 확인해주세요.')
  const score = normalizeScore(target)
  if ((valueKind === 'count' ? score.kind !== 'count' : score.kind !== 'seconds') ||
      !('value' in score) || typeof score.value !== 'number' || !Number.isSafeInteger(score.value)) {
    throw new EventInputError('개수는 정수, 시간은 분:초 형식으로 입력해주세요.')
  }
  if (maxScore !== null && (typeof maxScore !== 'number' || !Number.isSafeInteger(maxScore) || maxScore <= 0)) throw new EventInputError('만점은 양의 정수 또는 빈칸이어야 합니다.')
  if (valueKind === 'time' && maxScore !== null) throw new EventInputError('시간 종목에는 만점을 지정할 수 없습니다.')
  if (maxScore !== null && score.value > maxScore) throw new EventInputError('목표는 만점보다 클 수 없습니다.')
  if (direction !== '높을수록' && direction !== '낮을수록') throw new EventInputError('순위 방향을 확인해주세요.')
  if (typeof exemptable !== 'boolean') throw new EventInputError('면제 허용 여부를 선택해주세요.')
  return { action: 'create', name: name.trim().normalize('NFC'), target: target.trim(), maxScore, valueKind, direction, exemptable }
}

export function buildEventPlan(bundle: SheetRawBundle, sheetId: number, command: EventCommand, newId: string) {
  if (!bundle.goals) throw new Error('목표 탭을 찾을 수 없습니다.')
  const { identityMode, sheetRowById } = parseGoals(bundle.goals.values)
  if (identityMode !== 'id') throw new EventInputError('종목 ID 이전을 먼저 완료해주세요.')
  // A same-name addition must never make a legacy round header ambiguous.
  if (bundle.rounds.some((r) => r.values[0]?.slice(1).some((h) => h.trim() && !h.startsWith('id:')))) {
    throw new EventInputError('모든 회차 헤더를 ID 형식으로 먼저 이전해주세요.')
  }
  const before = buildRecordsResponse(bundle, 'validation')
  const rows = bundle.goals.values.map((r) => [...r])
  let requests: unknown[]
  let eventId: string
  if (command.action === 'create') {
    if (!isEventId(newId) || sheetRowById.has(newId)) throw new Error('새 종목 ID가 중복되거나 유효하지 않습니다.')
    eventId = newId
    const row = [command.name, command.target, command.maxScore === null ? '' : String(command.maxScore), command.direction, '', command.exemptable ? '가능' : '', newId]
    rows.push(row)
    // appendCells selects the end on the server; concurrent additions cannot overwrite a row.
    requests = [{ appendCells: { sheetId, rows: [{ values: row.map((stringValue) => ({ userEnteredValue: { stringValue } })) }], fields: 'userEnteredValue' } }]
    if (!rows[0][5]) {
      rows[0][5] = '면제 가능'
      requests.unshift({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 5 }, rows: [{ values: [{ userEnteredValue: { stringValue: '면제 가능' } }] }], fields: 'userEnteredValue' } })
    }
  } else {
    eventId = command.id
    const event = before.events.find((e) => e.id === eventId)
    if (!event) throw new EventInputError('종목을 찾을 수 없습니다.')
    if (event.endSessionDate !== null) throw new EventInputError('이미 종료된 종목입니다.')
    const measured = before.sessions.filter((s) => s.eventIds.includes(eventId)).map((s) => s.date).sort()
    const lastDate = measured.at(-1) ?? before.sessions.map((s) => s.date).sort().at(-1)
    if (!lastDate || command.endSessionDate !== lastDate) throw new EventInputError('마지막 측정 회차로만 종료할 수 있습니다. 미측정 종목은 최신 회차를 선택해주세요.')
    const rowNumber = sheetRowById.get(eventId)!
    rows[rowNumber - 1][4] = command.endSessionDate
    requests = [{ updateCells: { start: { sheetId, rowIndex: rowNumber - 1, columnIndex: 4 }, rows: [{ values: [{ userEnteredValue: { stringValue: command.endSessionDate } }] }], fields: 'userEnteredValue' } }]
  }
  // Validate the complete projected sheet, including records after the selected end date.
  buildRecordsResponse({ ...bundle, goals: { ...bundle.goals, values: rows } }, 'validation')
  return { requests, eventId }
}
