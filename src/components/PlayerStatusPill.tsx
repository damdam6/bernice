import type { PlayerStatus } from '../../shared/domain'
import { Pill } from './Pill'

type PlayerStatusPillProps = {
  status: PlayerStatus
}

const PLAYER_STATUS_PILL_STYLE: Record<PlayerStatus, string> = {
  활동: 'bg-good-tint text-good-strong',
  휴식: 'bg-warn-tint text-warn-strong',
  비대상: 'bg-neutral-tint text-neutral-strong',
  탈퇴: 'bg-bad/10 text-bad',
}

export function PlayerStatusPill({ status }: PlayerStatusPillProps) {
  return <Pill colorClassName={PLAYER_STATUS_PILL_STYLE[status]}>{status}</Pill>
}
