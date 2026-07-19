import { PLAYER_STATUSES, type PlayerStatus } from '../../shared/domain'

export type StatusValue =
  | { kind: 'known'; value: PlayerStatus }
  | { kind: 'unknown'; raw: string }

export function normalizeStatus(raw: string | null | undefined): StatusValue {
  const trimmed = (raw ?? '').trim().normalize('NFKC')

  const match = PLAYER_STATUSES.find((status) => status === trimmed)
  if (match) return { kind: 'known', value: match }

  return { kind: 'unknown', raw: raw ?? '' }
}
