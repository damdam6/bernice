// Gauge의 채움 계산 — DOM 없이 단위 테스트하기 위해 렌더링과 분리한 순수 함수.

/** achievedCount를 [0, eligibleCount]로 클램프 — eligibleCount<=0 또는 NaN은 0으로 방어. */
function clampAchieved(achievedCount: number, eligibleCount: number): number {
  if (Number.isNaN(achievedCount) || eligibleCount <= 0) return 0
  return Math.min(Math.max(0, achievedCount), eligibleCount)
}

/** 채움 바 width(%) — eligibleCount<=0(전원 면제 등)이면 0%. */
export function computeGaugePercent(achievedCount: number, eligibleCount: number): number {
  if (eligibleCount <= 0) return 0
  return (clampAchieved(achievedCount, eligibleCount) / eligibleCount) * 100
}

/** 전원 달성 여부 — eligibleCount<=0은 전원 달성으로 보지 않는다(도메인 규칙: 0/0 → rate 0과 동일 결). */
export function isGaugeFullyAchieved(achievedCount: number, eligibleCount: number): boolean {
  if (eligibleCount <= 0) return false
  return clampAchieved(achievedCount, eligibleCount) >= eligibleCount
}

/** "n/m명 달성" 라벨 — NaN만 0으로 가드하고 원값을 그대로 보여준다. */
export function formatGaugeLabel(achievedCount: number, eligibleCount: number): string {
  const safe = (n: number) => (Number.isNaN(n) ? 0 : Math.trunc(n))
  return `${safe(achievedCount)}/${safe(eligibleCount)}명 달성`
}
