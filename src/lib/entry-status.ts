// 입력 상태 파생 — docs/prd-design.html §05 · docs/prd-record-input.html §05 계약을 코드화한다.
// 참가자 목록 뱃지(미입력/일부/완료)와 날짜 선택 화면의 "완료 n/N"이 이 모듈 하나를 공유해,
// 파생 규칙이 두 화면에서 어긋나지 않게 한다.
//
// 분모는 전역 events[] 전체가 아니라 그 회차 Session.eventKeys다(이슈 #117) — 종목은 회차
// 사이에 추가·종료될 수 있어(shared/domain.ts EventDefinition.endSessionDate), 전역 분모를
// 쓰면 종목이 새로 추가될 때마다 과거 회차가 그 종목을 영원히 "채우지 못한 것"처럼 취급돼
// 판정이 흔들린다. SessionEntry.scores는 "그 회차 eventKeys 전체가 항상 존재(누락 없음)"가
// 타입 계약이라(shared/domain.ts) null 체크 없이 순회한다.
import type { SessionEntry } from '../../shared/domain'

export const ENTRY_STATUSES = ['미입력', '일부', '완료'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

export function deriveEntryStatus(entry: SessionEntry, eventKeys: string[]): EntryStatus {
  const unmeasuredCount = eventKeys.filter((key) => entry.scores[key]?.status === 'unmeasured').length

  if (unmeasuredCount === eventKeys.length) return '미입력'
  if (unmeasuredCount === 0) return '완료'
  return '일부'
}

export function countCompleted(entries: SessionEntry[], eventKeys: string[]): number {
  return entries.filter((entry) => deriveEntryStatus(entry, eventKeys) === '완료').length
}
