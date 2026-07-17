// 공통 차트 색·스타일 테마 — src/index.css의 Tailwind @theme 토큰을 그대로 참조한다.
// Tailwind v4 @theme는 이 값들을 실제 CSS 커스텀 프로퍼티로도 방출하므로 var(...) 참조가
// SVG stroke/fill에도 그대로 적용된다 — 새 hex 상수를 만들지 않고 index.css를 단일 진실 소스로 유지.

// 계열 색상 우선순위: 브랜드 오렌지 → 액센트 블루("차트 대비색") → 시맨틱 → 브랜드/액센트 보조 톤.
// 멀티라인 추이(전체 추이)·멀티시리즈 레이더처럼 계열이 여러 개일 때 순서대로 배정된다.
export const CHART_SERIES_COLORS = [
  'var(--color-brand-500)',
  'var(--color-accent-500)',
  'var(--color-good)',
  'var(--color-warn)',
  'var(--color-brand-800)',
  'var(--color-accent-600)',
] as const

export function seriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]
}

export const CHART_GRID_COLOR = 'var(--color-brand-100)'
export const CHART_AXIS_LINE_COLOR = 'var(--color-brand-200)'

export const CHART_AXIS_TICK_STYLE = {
  fill: 'var(--color-brand-700)',
  fontSize: 12,
  fontFamily: 'var(--font-sans)',
} as const

export const CHART_LEGEND_STYLE = {
  fontSize: 12,
  fontFamily: 'var(--font-sans)',
  color: 'var(--color-brand-900)',
} as const

// 컨테이너·라인 추이 프리셋이 공유하는 기본 높이 — 단일 진실 소스. 레이더는 형태가 달라(정사각에 가까움)
// 별도 기본값(280)을 쓴다.
export const CHART_DEFAULT_HEIGHT = 260
