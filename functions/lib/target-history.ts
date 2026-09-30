import type { EventDefinition } from '../../shared/domain'
import { parseTargetHistory } from '../../shared/event-target'
import { normalizeScore } from '../../shared/normalize-score'
import type { RoundRawTable } from './sheetsApi'

export const TARGET_HISTORY_TAB = '목표 이력'

/** A:C = 적용 회차 | 종목 ID | 목표. Names are never used to join records. */
export function attachTargetHistory(events: EventDefinition[], rows: string[][] | undefined, rounds: RoundRawTable[]): EventDefinition[] {
  if (!rows?.length) return events
  if (['적용 회차', '종목 ID', '목표'].some((label, i) => rows[0][i]?.trim() !== label)) throw new Error('목표 이력 헤더가 올바르지 않습니다')
  const grouped = new Map<string, { fromSessionDate: string; target: string; targetValue: number }[]>()
  for (const row of rows.slice(1)) {
    if (row.every((cell) => !cell.trim())) continue
    const [date, id, rawTarget] = row
    const event = events.find((item) => item.id === id)
    if (!event || !rounds.some((round) => round.name === date) || (event.endSessionDate !== null && date > event.endSessionDate)) throw new Error('목표 이력의 종목 ID 또는 적용 회차가 올바르지 않습니다')
    const target = rawTarget?.trim() ?? ''
    const score = normalizeScore(target)
    if (score.kind !== 'count' && score.kind !== 'seconds') throw new Error('목표 이력의 목표 형식이 올바르지 않습니다')
    grouped.set(id, [...(grouped.get(id) ?? []), { fromSessionDate: date, target, targetValue: score.value }])
  }
  return events.map((event) => grouped.has(event.id) ? { ...event, targetHistory: parseTargetHistory(grouped.get(event.id), event) } : event)
}
