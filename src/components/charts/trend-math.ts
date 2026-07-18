// 종목 추이 차트 좌표 계산 — DOM 없이 단위 테스트하기 위해 렌더링과 분리한 순수 함수.

import { clamp01 } from '../../lib/performance-scale'

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
  value: number // 정규화 성능 0~1
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 회차 인덱스 → x 좌표. 회차가 1개면 중앙에 둔다(0 나누기 방어). */
export function trendX(index: number, count: number, layout: TrendLayout): number {
  const inner = layout.width - layout.padX * 2
  if (count <= 1) return round2(layout.width / 2)
  return round2(layout.padX + (inner * index) / (count - 1))
}

/** 정규화 성능(0~1, 1 = 좋음) → y 좌표. 위가 좋음이므로 반전한다. */
export function trendY(value: number, layout: TrendLayout): number {
  const inner = layout.height - layout.padTop - layout.padBottom
  return round2(layout.padTop + (1 - clamp01(value)) * inner)
}

/** 시리즈 → SVG polyline points 문자열. 라벨 범위 밖 인덱스는 방어적으로 버린다. */
export function polylinePoints(points: TrendPointDatum[], count: number, layout: TrendLayout): string {
  return points
    .filter((point) => point.sessionIndex >= 0 && point.sessionIndex < count)
    .map((point) => `${trendX(point.sessionIndex, count, layout)},${trendY(point.value, layout)}`)
    .join(' ')
}
