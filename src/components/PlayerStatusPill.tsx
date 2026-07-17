import type { PlayerStatus } from '../../shared/domain'
import { Pill } from './Pill'

type PlayerStatusPillProps = {
  status: PlayerStatus
}

const PLAYER_STATUS_PILL_STYLE: Record<PlayerStatus, string> = {
  활동: 'bg-good/15 text-good',
  휴식: 'bg-warn/15 text-warn',
  비대상: 'bg-slate-200 text-slate-600',
  탈퇴: 'bg-bad/15 text-bad',
}

export function PlayerStatusPill({ status }: PlayerStatusPillProps) {
  return <Pill colorClassName={PLAYER_STATUS_PILL_STYLE[status]}>{status}</Pill>
}
