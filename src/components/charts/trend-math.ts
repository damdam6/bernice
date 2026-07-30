// 종목 추이 차트 좌표 계산 — DOM 없이 단위 테스트하기 위해 렌더링과 분리한 순수 함수.
//
// y축은 정규화 성능이 아니라 종목 원값이다(이슈 #172). 축 반전이 없으므로 값이 크면 위,
// 작으면 아래 — "낮을수록" 종목은 기록이 좋아지면 선이 내려간다. 좋고 나쁨은 카드 헤더의
// 델타 색과 목표선이 전달하고, 차트는 값의 모양만 보여준다. 정규화 성능(performance-scale)은
// 레이더·랭킹 미니바 전용으로 남는다.

export interface TrendLayout {
  width: number
  height: number
  padX: number
  padTop: number
  padBottom: number // x축 라벨 영역 포함
}

/** 시리즈의 점 하나 — sessionIndex는 sessionLabels 배열 인덱스(희소 허용: 미기록 회차는 점이 없다). */
export interface TrendPointDatum {
  sessionIndex: number
  value: number // 종목 원값(시간=초, 개수=그대로)
}

/** y축 값 범위 — max가 상단, min이 하단(반전 없음). trendDomain이 만든다. */
export interface TrendDomain {
  min: number
  max: number
}

/** 축 여백 — 값 범위 대비 위아래 비율. */
const PAD_RATIO = 0.08
/** 값이 하나뿐이거나 전부 동률일 때의 폴백 반경(값 대비 비율, 최소 1). */
const FLAT_HALF_RATIO = 0.1

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 회차 인덱스 → x 좌표. 회차가 1개면 중앙에 둔다(0 나누기 방어). */
export function trendX(index: number, count: number, layout: TrendLayout): number {
  const inner = layout.width - layout.padX * 2
  if (count <= 1) return round2(layout.width / 2)
  return round2(layout.padX + (inner * index) / (count - 1))
}

/** y축 값 범위 = 본인 recorded 점 ∪ 목표값 + 패딩 (#172). "자신의 추이만 보는" 차트라는
 *  목적에 맞춰 팀 배경 라인은 범위 계산에서 제외한다 — 범위를 벗어난 배경 구간은 호출자가
 *  클립한다(가장자리 클램프는 값 왜곡이라 쓰지 않는다). 목표값은 항상 포함되므로 목표선은
 *  언제나 보인다.
 *
 *  엣지: 본인 점이 1개거나 전부 동률(min == max)이면 값 기준 폴백 패딩으로 중앙 배치한다.
 *  본인 점도 목표도 없는 경우(prop 수준에서만 가능)에만 배경 extent로 폴백해 차트가 통째로
 *  비는 것을 막고, 그것도 없으면 0~1. */
export function trendDomain(
  highlight: TrendPointDatum[],
  goal?: number,
  background: TrendPointDatum[][] = [],
): TrendDomain {
  const values = highlight.map((point) => point.value).filter((value) => Number.isFinite(value))
  if (goal !== undefined && Number.isFinite(goal)) values.push(goal)
  if (values.length === 0) {
    const fromBackground = background
      .flat()
      .map((point) => point.value)
      .filter((value) => Number.isFinite(value))
    if (fromBackground.length === 0) return { min: 0, max: 1 }
    values.push(...fromBackground)
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const half = Math.max(Math.abs(min) * FLAT_HALF_RATIO, 1)
    return { min: min - half, max: max + half }
  }
  const pad = (max - min) * PAD_RATIO
  return { min: min - pad, max: max + pad }
}

/** 원값 → y 좌표. domain.max가 상단, domain.min이 하단 — 축을 반전하지 않는다(#172).
 *  범위 밖 값은 클램프하지 않고 플롯 밴드 밖 좌표를 낸다(배경 라인 클립이 잘라내는 몫).
 *  비정상 값·평평한 도메인만 방어적으로 중앙에 둔다. */
export function trendY(value: number, domain: TrendDomain, layout: TrendLayout): number {
  const inner = layout.height - layout.padTop - layout.padBottom
  const span = domain.max - domain.min
  if (!Number.isFinite(value) || span <= 0) return round2(layout.padTop + inner / 2)
  return round2(layout.padTop + (1 - (value - domain.min) / span) * inner)
}

/** 시리즈 → SVG polyline points 문자열. 라벨 범위 밖 인덱스는 방어적으로 버린다. */
export function polylinePoints(
  points: TrendPointDatum[],
  count: number,
  layout: TrendLayout,
  domain: TrendDomain,
): string {
  return points
    .filter((point) => point.sessionIndex >= 0 && point.sessionIndex < count)
    .map((point) => `${trendX(point.sessionIndex, count, layout)},${trendY(point.value, domain, layout)}`)
    .join(' ')
}
