import type { EventDefinition } from '../../shared/domain'
import type { PerformanceScale } from '../lib/performance-scale'
import type { RankingRowDatum } from '../lib/ranking-view'
import { AchievementBadge } from './AchievementBadge'
import { Pill } from './Pill'
import { PerformanceBar } from './charts'

type RankingRowProps = {
  row: RankingRowDatum
  event: EventDefinition
  scale: PerformanceScale
  /** buildRankingRows 결과 전체에 대해 findTiedRanks로 미리 계산한 공동순위 집합 */
  tiedRanks: Set<number>
}

type SupplementalStatus = Exclude<RankingRowDatum['status'], 'recorded'>

const SUPPLEMENTAL_BADGE_LABEL: Record<SupplementalStatus, string> = {
  exempt: '면제',
  unmeasured: '미측정',
  invalid: '이상값',
}

// 순위 자리 표기 — §05는 면제/미측정만 규정("—"/"면제"). invalid는 명시가 없어
// unmeasured와 동일 취급으로 해석한다(작업 플랜 §3-③ 근거).
const SUPPLEMENTAL_RANK_SLOT: Record<SupplementalStatus, string> = {
  exempt: '면제',
  unmeasured: '—',
  invalid: '—',
}

// 랭킹 카드 행 — §05: 순위(1위 강조) · 이름 · 뱃지 · 성능 미니바 · 원값("/ 만점" 병기).
export function RankingRow({ row, event, scale, tiedRanks }: RankingRowProps) {
  if (row.status === 'recorded') {
    const isTop = row.rank === 1
    const rankLabel = tiedRanks.has(row.rank) ? `공동 ${row.rank}위` : `${row.rank}위`
    const valueDisplay =
      event.valueKind === 'count' && event.maxScore != null ? `${row.display} / ${event.maxScore}` : row.display

    return (
      <div className="flex items-center gap-3 rounded-card border border-line bg-white p-4">
        <span className={`w-14 shrink-0 text-sm font-bold ${isTop ? 'text-primary' : 'text-ink-sub'}`}>{rankLabel}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-ink">{row.name}</span>
            <AchievementBadge achieved={row.achieved} />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <PerformanceBar value={scale.normalize(event.key, row.value)} achieved={row.achieved} />
            <span className="shrink-0 text-sm tabular-nums text-ink-sub">{valueDisplay}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-white p-4">
      <span className="w-14 shrink-0 text-sm font-bold text-ink-muted">{SUPPLEMENTAL_RANK_SLOT[row.status]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold text-ink">{row.name}</span>
          <Pill colorClassName="bg-neutral-tint text-neutral-strong">{SUPPLEMENTAL_BADGE_LABEL[row.status]}</Pill>
        </div>
        <p className="mt-2 text-sm text-ink-sub">{row.status === 'invalid' ? row.display : '–'}</p>
      </div>
    </div>
  )
}
