import { clamp01 } from '../../lib/performance-scale'
import { polygonPoints, radarLabelLayout, radarPoint, ringPoints } from './radar-math'

export interface RadarAxis {
  /** 종목 short 라벨 */
  label: string
  /** 정규화 성능 0~1 — performance-scale.normalize 결과 (§07) */
  value: number
}

export interface RadarChartProps {
  axes: RadarAxis[]
  /** 렌더 크기(px, 정사각) */
  size?: number
}

const RING_COUNT = 4
const VIEW = 200 // viewBox 한 변 — 좌표 계산 기준
const CENTER = VIEW / 2
const RADIUS = 72 // 값 1.0의 반지름 — 바깥 라벨 여백을 남긴다
const LABEL_DISTANCE = 1.22 // 라벨은 최대 반지름의 22% 바깥
const DOT_RADIUS = 3

// 개인 프로필의 종목 스킬 레이더 — §07: 링 4개(chart-grid) + 채움 폴리곤(primary 14% 투명)
// + 꼭짓점 도트. 값은 이미 정규화된 0~1을 받는다(데이터 결합은 화면 쪽 책임).
export function RadarChart({ axes, size = 240 }: RadarChartProps) {
  if (axes.length === 0) return null

  const values = axes.map((axis) => clamp01(axis.value))
  const ariaLabel = `종목 프로필 레이더 — ${axes
    .map((axis, i) => `${axis.label} ${Math.round(values[i] * 100)}%`)
    .join(', ')}`

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} role="img" aria-label={ariaLabel}>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <polygon
          key={i}
          points={ringPoints(i + 1, RING_COUNT, axes.length, CENTER, RADIUS)}
          fill="none"
          strokeWidth={1}
          className="stroke-chart-grid"
        />
      ))}
      <polygon
        points={polygonPoints(values, CENTER, RADIUS)}
        fillOpacity={0.14}
        strokeWidth={1.5}
        className="fill-primary stroke-primary"
      />
      {values.map((value, i) => {
        const point = radarPoint(i, values.length, value, CENTER, RADIUS)
        return <circle key={axes[i].label} cx={point.x} cy={point.y} r={DOT_RADIUS} className="fill-primary" />
      })}
      {axes.map((axis, i) => {
        const point = radarPoint(i, axes.length, LABEL_DISTANCE, CENTER, RADIUS)
        const { anchor, baseline } = radarLabelLayout(i, axes.length)
        return (
          <text
            key={axis.label}
            x={point.x}
            y={point.y}
            textAnchor={anchor}
            dominantBaseline={baseline}
            fontSize={11}
            className="fill-ink-sub"
          >
            {axis.label}
          </text>
        )
      })}
    </svg>
  )
}
