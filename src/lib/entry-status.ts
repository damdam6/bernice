// 입력 상태 파생 — docs/prd-design.html §05 · docs/prd-record-input.html §05 계약을 코드화한다.
// 참가자 목록 뱃지(미입력/일부/완료)와 날짜 선택 화면의 "완료 n/N"이 이 모듈 하나를 공유해,
// 파생 규칙이 두 화면에서 어긋나지 않게 한다.
//
// SessionEntry.scores는 "events[] 전체 key가 항상 존재(누락 없음)"가 타입 계약이라
// (shared/domain.ts) null 체크 없이 순회한다.
import type { EventDefinition, SessionEntry } from '../../shared/domain'

export const ENTRY_STATUSES = ['미입력', '일부', '완료'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

export function deriveEntryStatus(entry: SessionEntry, events: EventDefinition[]): EntryStatus {
  const unmeasuredCount = events.filter((event) => entry.scores[event.key]?.status === 'unmeasured').length

  if (unmeasuredCount === events.length) return '미입력'
  if (unmeasuredCount === 0) return '완료'
  return '일부'
}

export function countCompleted(entries: SessionEntry[], events: EventDefinition[]): number {
  return entries.filter((entry) => deriveEntryStatus(entry, events) === '완료').length
}
