import { PLAYER_STATUSES, type PlayerStatus } from '../../shared/domain'

// blank(빈칸 = 드롭다운 미선택)와 unknown(비어 있지 않은 미지 값 = 시트 직접 편집 의심)을
// 구분해 운영 진단에 쓴다 — raw는 둘 다 트림 전 원본 보존(normalize-score의 blank와 대칭).
export type StatusValue =
  | { kind: 'known'; value: PlayerStatus }
  | { kind: 'blank'; raw: string }
  | { kind: 'unknown'; raw: string }

export function normalizeStatus(raw: string | null | undefined): StatusValue {
  const trimmed = (raw ?? '').trim().normalize('NFKC')
  if (trimmed === '') return { kind: 'blank', raw: raw ?? '' }

  const match = PLAYER_STATUSES.find((status) => status === trimmed)
  if (match) return { kind: 'known', value: match }

  return { kind: 'unknown', raw: raw ?? '' }
}
