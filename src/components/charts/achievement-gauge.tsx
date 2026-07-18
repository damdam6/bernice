import { clamp01 } from '../../lib/performance-scale'

export interface AchievementGaugeProps {
  /** 달성률 0~1 — home.achievementRates[].rate 그대로 */
  value: number
}

// 홈 종목별 달성률 게이지 — §07: 8px 트랙(gauge-track) + 채움 바, 전원 달성 primary /
// 미만 primary-soft, width 트랜지션 .5s. 종목명·"n/m명 달성" 텍스트는 화면 쪽 책임.
export function AchievementGauge({ value }: AchievementGaugeProps) {
  const clamped = clamp01(value)
  const full = clamped >= 1

  return (
    <div
      role="img"
      aria-label={`달성률 ${Math.round(clamped * 100)}%`}
      className="h-2 w-full overflow-hidden rounded-full bg-gauge-track"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${full ? 'bg-primary' : 'bg-primary-soft'}`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  )
}
