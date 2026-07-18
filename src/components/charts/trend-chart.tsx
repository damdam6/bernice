import { clamp01 } from '../../lib/performance-scale'
import type { TrendLayout, TrendPointDatum } from './trend-math'
import { polylinePoints, trendX, trendY } from './trend-math'

export type { TrendPointDatum } from './trend-math'

export interface TrendChartProps {
  /** x축 회차 라벨 — 날짜 오름차순 ("1차", "2차", …). 파생 규칙은 화면 쪽 책임(§09) */
  sessionLabels: string[]
  /** 본인 라인 — 유효 기록 회차만(희소 허용) */
  highlight: TrendPointDatum[]
  /** 전체 선수 배경 라인들 — 본인 제외 여부는 호출자가 정한다 */
  background?: TrendPointDatum[][]
  /** 정규화된 목표선 y값 0~1 — performance-scale.normalize(event, targetValue) */
  goal?: number
  /** viewBox 높이 — 렌더 폭은 부모에 맞춰 100% */
  height?: number
  /** 접근성 라벨 (예: "셔틀런 추이") */
  label?: string
}

const VIEW_WIDTH = 320
const DEFAULT_HEIGHT = 160
const HIGHLIGHT_DOT_RADIUS = 3.6

// 개인 카드 확장 추이 — §07: 전체 선수 배경 라인(primary-soft 1.6px) 위에 본인 하이라이트
// (primary 3.2px + 도트 r3.6), 목표선은 good 1.5px 점선(4 4). x = 회차, y = 정규화 성능.
export function TrendChart({
  sessionLabels,
  highlight,
  background = [],
  goal,
  height = DEFAULT_HEIGHT,
  label = '종목 추이',
}: TrendChartProps) {
  if (sessionLabels.length === 0) return null

  const layout: TrendLayout = { width: VIEW_WIDTH, height, padX: 18, padTop: 12, padBottom: 26 }
  const count = sessionLabels.length
  const goalY = goal === undefined ? null : trendY(clamp01(goal), layout)

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} ${height}`} width="100%" role="img" aria-label={label}>
      {background.map((series, i) => (
        <polyline
          key={i}
          points={polylinePoints(series, count, layout)}
          fill="none"
          strokeWidth={1.6}
          className="stroke-primary-soft"
        />
      ))}
      {goalY !== null && (
        <line
          x1={layout.padX}
          x2={VIEW_WIDTH - layout.padX}
          y1={goalY}
          y2={goalY}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          className="stroke-good"
        />
      )}
      <polyline
        points={polylinePoints(highlight, count, layout)}
        fill="none"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
      />
      {highlight
        .filter((point) => point.sessionIndex >= 0 && point.sessionIndex < count)
        .map((point) => (
          <circle
            key={point.sessionIndex}
            cx={trendX(point.sessionIndex, count, layout)}
            cy={trendY(point.value, layout)}
            r={HIGHLIGHT_DOT_RADIUS}
            className="fill-primary"
          />
        ))}
      {sessionLabels.map((sessionLabel, i) => (
        <text
          key={i}
          x={trendX(i, count, layout)}
          y={height - 8}
          textAnchor="middle"
          fontSize={10}
          className="fill-ink-sub"
        >
          {sessionLabel}
        </text>
      ))}
    </svg>
  )
}
