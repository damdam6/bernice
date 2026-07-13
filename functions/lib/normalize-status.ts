export const MEMBER_STATUSES = ['활동', '탈퇴', '비대상', '휴식'] as const

export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export type StatusValue =
  | { kind: 'known'; value: MemberStatus }
  | { kind: 'unknown'; raw: string }

export function normalizeStatus(raw: string | null | undefined): StatusValue {
  const trimmed = (raw ?? '').trim().normalize('NFC')

  const match = MEMBER_STATUSES.find((status) => status === trimmed)
  if (match) return { kind: 'known', value: match }

  return { kind: 'unknown', raw: raw ?? '' }
}
