import type { EventDefinition } from './domain'
/** Comma-separated sheet cells; names cannot contain commas or control characters. */
export function normalizeEventTags(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > 10) throw new Error('태그는 최대 10개까지 지정할 수 있습니다.')
  const tags: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string' || /[,\x00-\x1f\x7f]/.test(value)) throw new Error('태그는 쉼표나 줄바꿈 없이 입력해주세요.')
    const tag = value.trim().normalize('NFC')
    if (!tag) continue
    if (tag.length > 30) throw new Error('태그는 30자 이내로 입력해주세요.')
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
}
export function tagsFromCell(value: string): string[] { return normalizeEventTags(value.split(',')) }
export function allEventTags(events: EventDefinition[]): string[] {
  return [...new Set(events.flatMap((e) => e.tags ?? []))].sort((a, b) => a.localeCompare(b, 'ko'))
}
export function filterEventsByTag(events: EventDefinition[], tag: string | null): EventDefinition[] {
  return tag === null ? events : events.filter((e) => tag === '' ? !e.tags?.length : e.tags?.includes(tag))
}
