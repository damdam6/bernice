import type { EventDefinition, EventTarget } from './domain'
import { isPlainObject } from './is-plain-object'
import { normalizeScore } from './normalize-score'

/** The base target applies before the first change; changes persist into later rounds. */
export function eventAtSession(event: EventDefinition, date: string): EventDefinition {
  let target: EventTarget | undefined
  for (const item of event.targetHistory ?? []) {
    if (item.fromSessionDate <= date && (!target || item.fromSessionDate > target.fromSessionDate)) target = item
  }
  return target ? { ...event, target: target.target, targetValue: target.targetValue } : event
}

export function parseTargetHistory(raw: unknown, event: Pick<EventDefinition, 'valueKind' | 'maxScore'>): EventTarget[] {
  if (!Array.isArray(raw)) throw new Error('목표 이력은 배열이어야 합니다')
  const dates = new Set<string>()
  const result = raw.map((item): EventTarget => {
    if (!isPlainObject(item) || typeof item.fromSessionDate !== 'string' || typeof item.target !== 'string') throw new Error('목표 이력 형식 오류')
    const date = item.fromSessionDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || dates.has(date)) throw new Error('목표 적용 회차가 잘못되었거나 중복됩니다')
    dates.add(date)
    const score = normalizeScore(item.target)
    if ((event.valueKind === 'time' ? score.kind !== 'seconds' : score.kind !== 'count') || !('value' in score) || typeof score.value !== 'number' || !Number.isFinite(score.value) || score.value !== item.targetValue || (event.maxScore !== null && score.value > event.maxScore)) throw new Error('목표 이력 값이 종목 기준과 맞지 않습니다')
    return { fromSessionDate: date, target: item.target, targetValue: score.value }
  })
  return result.sort((a, b) => a.fromSessionDate.localeCompare(b.fromSessionDate))
}
