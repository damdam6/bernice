// Gauge의 원형 채움 계산 — DOM 없이 단위 테스트하기 위해 렌더링과 분리한 순수 함수.
export const GAUGE_RADIUS = 42
export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS

/** 범위 밖 값과 NaN을 0~100으로 클램프 — 상류(도메인 rate 등)의 계산 오차나 미확정 값을 방어. */
export function clampGaugeValue(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/** SVG stroke-dasharray 값 — "채움 길이 나머지 길이" 순서라 100%에서도 원둘레 전체가 자연히 채워진다. */
export function getGaugeDashArray(value: number): string {
  const filled = (clampGaugeValue(value) / 100) * GAUGE_CIRCUMFERENCE
  return `${filled} ${GAUGE_CIRCUMFERENCE - filled}`
}
