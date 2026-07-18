import { computeGaugePercent, formatGaugeLabel, isGaugeFullyAchieved } from './gauge-math'

interface GaugeProps {
  /** 목표를 달성한 인원 */
  achievedCount: number
  /** 집계 대상 인원 */
  eligibleCount: number
  /** 게이지 위 캡션 (예: 종목명) */
  label?: string
}

export function Gauge({ achievedCount, eligibleCount, label }: GaugeProps) {
  const percent = computeGaugePercent(achievedCount, eligibleCount)
  const fullyAchieved = isGaugeFullyAchieved(achievedCount, eligibleCount)
  const achievementLabel = formatGaugeLabel(achievedCount, eligibleCount)

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-2">
        {label && <span className="text-sm font-semibold text-ink">{label}</span>}
        <span className="text-xs text-ink-sub">{achievementLabel}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? `${label} ${achievementLabel}` : achievementLabel}
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gauge-track"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fullyAchieved ? 'bg-primary' : 'bg-primary-soft'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
