import type { EventDefinition, Session } from './domain'

/** Opaque, case-sensitive IDs. Never normalize or derive these from a display name. */
export function isEventId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value === value.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
}

export const EVENT_HEADER_PREFIX = 'id:'

export function indexEvents(events: EventDefinition[]): Map<string, EventDefinition> {
  const byId = new Map<string, EventDefinition>()
  for (const event of events) {
    if (!isEventId(event.id)) throw new Error(`유효하지 않은 종목 ID: "${event.id}"`)
    if (byId.has(event.id)) throw new Error(`종목 ID가 중복됩니다: "${event.id}"`)
    byId.set(event.id, event)
  }
  return byId
}

/** Legacy headers resolve only when exactly one definition matches; dates never break ties. */
export function resolveEventHeader(label: string, events: EventDefinition[], byId: Map<string, EventDefinition>): EventDefinition | undefined {
  if (label.startsWith(EVENT_HEADER_PREFIX)) {
    const id = label.slice(EVENT_HEADER_PREFIX.length).split('\n')[0]
    if (!isEventId(id)) throw new Error(`유효하지 않은 회차 종목 ID: "${id}"`)
    return byId.get(id)
  }
  const name = label.trim().normalize('NFC')
  const matches = events.filter((event) => event.name === name || event.legacyName === name)
  if (matches.length > 1) throw new Error(`종목명 "${name}" 매핑이 모호합니다 — 대응 ID: ${matches.map((e) => e.id).join(', ')}. 회차 헤더를 ID 형식으로 이전하세요.`)
  return matches[0]
}

/** Names stay readable; duplicate names also show lifecycle and observed measurement period. */
export function adminEventLabel(event: EventDefinition, events: EventDefinition[], sessions: Session[]): string {
  if (events.filter((candidate) => candidate.name === event.name).length < 2) return event.name
  const dates = sessions.filter((session) => session.eventIds.includes(event.id)).map((session) => session.date).sort()
  const period = dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '측정 전'
  return `${event.name} (${event.endSessionDate === null ? '진행 중' : '종료'} · ${period} · ${event.id})`
}

/** Public views identify records by ID internally but display only the event name. */
export function eventLabel(event: EventDefinition, _events: EventDefinition[], _sessions: Session[]): string {
  return event.name
}
