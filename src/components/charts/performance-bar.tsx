import { clamp01 } from '../../lib/performance-scale'

export interface PerformanceBarProps {
  /** 정규화 성능 0~1 — performance-scale.normalize 결과 (§07: 레이더·추이와 동일 정규화) */
  value: number
  /** 목표 달성 여부 — 달성 good / 미달 perf-muted */
  achieved: boolean
}

// 랭킹 행의 상대 성능 미니 바 — §07: 5px, 달성자 green(good), 미달 #c3ccdb(perf-muted).
export function PerformanceBar({ value, achieved }: PerformanceBarProps) {
  const clamped = clamp01(value)

  return (
    <div
      role="img"
      aria-label={`상대 성능 ${Math.round(clamped * 100)}%`}
      className="h-[5px] w-full overflow-hidden rounded-full bg-gauge-track"
    >
      <div
        className={`h-full rounded-full ${achieved ? 'bg-good' : 'bg-perf-muted'}`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  )
}
