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
/** 도메인 최소 폭 — 중앙값 대비 비율. 비율이라 종목 단위(초/개)에 무관하게 동작한다(#174). */
const MIN_SPAN_RATIO = 0.2
/** 최소 폭의 절대 하한 — 값이 0 근처여도 폭이 0으로 붕괴하지 않게 한다(#174). */
const MIN_SPAN_ABS = 2

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
 *  엣지: 값 범위가 최소 폭(중앙값의 20%, 절대 하한 2)보다 좁으면 그 폭까지 넓혀 중앙에
 *  배치한다(#174). 본인 점 1개 + 목표만 있는 경우가 대표적 — 75초와 목표 77초로 만든 폭
 *  2.3초짜리 범위가 카드 높이로 늘어나 2초 차이가 절벽처럼 보였다. 전부 동률(min == max)은
 *  폭 0이라 이 규칙의 특수 케이스로 흡수된다(옛 폴백 반경과 수치도 동일).
 *
 *  본인 점도 목표도 없는 경우(값이 전부 비유한일 때만 남는 경로)에만 배경 extent로 폴백해
 *  차트가 통째로 비는 것을 막고, 그것도 없으면 0~1. 본인 점이 아예 0개면 TrendChart가
 *  차트 대신 빈 상태 문구를 내므로 이 폴백까지 오지 않는다(#174). */
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
  const center = (min + max) / 2
  const minSpan = Math.max(Math.abs(center) * MIN_SPAN_RATIO, MIN_SPAN_ABS)
  if (max - min < minSpan) {
    const half = minSpan / 2
    return { min: center - half, max: center + half }
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

/** 라벨 범위 안의 점만 남긴다 — 범위 밖 인덱스는 x 좌표를 낼 수 없어 방어적으로 버린다.
 *  도메인 판정·폴리라인·도트·빈 상태 판정이 모두 같은 점 집합을 보게 하려고 한곳에 둔다(#174). */
export function renderablePoints(points: TrendPointDatum[], count: number): TrendPointDatum[] {
  return points.filter((point) => point.sessionIndex >= 0 && point.sessionIndex < count)
}

/** 값의 도메인 기준 위치 — -1 아래, 0 안, 1 위. 비유한 값은 trendY가 밴드 중앙에 두므로
 *  0(안)으로 본다 — 판정이 실제로 렌더되는 것보다 더 많이 숨기지 않게 하는 보수적 선택. */
function domainSide(value: number, domain: TrendDomain): -1 | 0 | 1 {
  if (!Number.isFinite(value)) return 0
  if (value < domain.min) return -1
  if (value > domain.max) return 1
  return 0
}

/** 시리즈가 도메인 밴드 안에 실제로 보이는 구간을 갖는지(#174). 배경 라인은 밴드로 클립되는데,
 *  도메인이 좁으면 전부 밴드 위(또는 아래)인 팀원 시리즈에서 인접 점 사이의 거의 수직인 토막만
 *  남아 세로 막대처럼 보였다 — 그런 시리즈는 호출자가 렌더에서 뺀다.
 *
 *  판정: 점 하나라도 도메인 안이면 보이고, 인접한 두 점이 위↔아래로 도메인을 가로지르면 그
 *  선분이 밴드를 관통하므로 보인다. 전부 위이거나 전부 아래일 때만 비가시다. 범위 밖 값을
 *  가장자리로 클램프하지 않는다는 원칙은 그대로다(#172) — 그리지 않을 뿐 왜곡하지 않는다. */
export function hasVisibleSegment(
  points: TrendPointDatum[],
  count: number,
  domain: TrendDomain,
): boolean {
  let previousSide: -1 | 0 | 1 | null = null
  for (const point of renderablePoints(points, count)) {
    const side = domainSide(point.value, domain)
    if (side === 0) return true
    if (previousSide !== null && previousSide !== side) return true
    previousSide = side
  }
  return false
}

/** 시리즈 → SVG polyline points 문자열. 라벨 범위 밖 인덱스는 방어적으로 버린다. */
export function polylinePoints(
  points: TrendPointDatum[],
  count: number,
  layout: TrendLayout,
  domain: TrendDomain,
): string {
  return renderablePoints(points, count)
    .map((point) => `${trendX(point.sessionIndex, count, layout)},${trendY(point.value, domain, layout)}`)
    .join(' ')
}
