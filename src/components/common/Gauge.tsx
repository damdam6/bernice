import { GAUGE_RADIUS, clampGaugeValue, getGaugeDashArray } from './gauge-math'

type GaugeSize = 'sm' | 'md'

interface GaugeProps {
  /** 0~100 (%) — 범위 밖 값은 클램프해 렌더 */
  value: number
  size?: GaugeSize
  /** 게이지 아래 캡션 (예: 종목명) */
  label?: string
}

const DIMENSION_PX: Record<GaugeSize, number> = { sm: 64, md: 96 }
const STROKE_WIDTH: Record<GaugeSize, number> = { sm: 8, md: 10 }
const TEXT_SIZE: Record<GaugeSize, string> = { sm: 'text-xs', md: 'text-lg' }

export function Gauge({ value, size = 'md', label }: GaugeProps) {
  const clamped = clampGaugeValue(value)
  const dimension = DIMENSION_PX[size]
  const strokeWidth = STROKE_WIDTH[size]
  const isPartial = clamped > 0 && clamped < 100

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div
        className="relative"
        style={{ width: dimension, height: dimension }}
        role="img"
        aria-label={`달성률 ${Math.round(clamped)}%`}
      >
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={GAUGE_RADIUS} fill="none" strokeWidth={strokeWidth} className="stroke-brand-100" />
          <circle
            cx="50"
            cy="50"
            r={GAUGE_RADIUS}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap={isPartial ? 'round' : 'butt'}
            strokeDasharray={getGaugeDashArray(clamped)}
            className="stroke-brand-500"
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-semibold text-brand-900 ${TEXT_SIZE[size]}`}
        >
          {Math.round(clamped)}%
        </span>
      </div>
      {label && <span className="text-xs text-brand-700">{label}</span>}
    </div>
  )
}
