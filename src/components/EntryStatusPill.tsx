import type { EntryStatus } from '../lib/entry-status'
import { Pill } from './Pill'

type EntryStatusPillProps = {
  status: EntryStatus
}

// §06 상태 뱃지 색 매핑: 미입력=neutral / 일부=warn / 완료=green.
const ENTRY_STATUS_PILL_STYLE: Record<EntryStatus, string> = {
  미입력: 'bg-neutral-tint text-neutral-strong',
  일부: 'bg-warn-tint text-warn-strong',
  완료: 'bg-good-tint text-good-strong',
}

export function EntryStatusPill({ status }: EntryStatusPillProps) {
  return <Pill colorClassName={ENTRY_STATUS_PILL_STYLE[status]}>{status}</Pill>
}
