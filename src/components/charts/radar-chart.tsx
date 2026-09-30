import { clamp01 } from '../../lib/performance-scale'
import { polygonPoints, radarPoint, ringPoints } from './radar-math'

export interface RadarAxis {
  /** 종목 short 라벨 */
  label: string
  /** Long duplicate-name identity labels are rendered below the chart, not clipped in SVG. */
  detail?: string
  /** 정규화 성능 0~1 — performance-scale.normalize 결과 (§07) */
  value: number
}

export interface RadarChartProps {
  axes: RadarAxis[]
  /** 최대 렌더 크기(px, 정사각). 생략하면 카드 가용 너비를 사용한다. */
  size?: number
}

const RING_COUNT = 4
const VIEW = 200 // viewBox 한 변 — 좌표 계산 기준
const CENTER = VIEW / 2
const RADIUS = 52 // 라벨 줄바꿈 영역까지 viewBox 안에 확보한다
const LABEL_DISTANCE = 1.5 // 라벨 중심은 최대 반지름의 50% 바깥
const DOT_RADIUS = 3

// 개인 프로필의 종목 스킬 레이더 — §07: 링 4개(chart-grid) + 채움 폴리곤(primary 14% 투명)
// + 꼭짓점 도트. 값은 이미 정규화된 0~1을 받는다(데이터 결합은 화면 쪽 책임).
export function RadarChart({ axes, size }: RadarChartProps) {
  if (axes.length === 0) return null

  const values = axes.map((axis) => clamp01(axis.value))
  const ariaLabel = `종목 프로필 레이더 — ${axes
    .map((axis, i) => `${axis.label} ${Math.round(values[i] * 100)}%`)
    .join(', ')}`

  return (
    <div className="min-w-0 w-full" style={{ maxWidth: size }}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size ?? VIEW} height={size ?? VIEW} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
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
          return <circle key={i} cx={point.x} cy={point.y} r={DOT_RADIUS} className="fill-primary" />
        })}
        {axes.map((axis, i) => {
          const point = radarPoint(i, axes.length, LABEL_DISTANCE, CENTER, RADIUS)
          // Keep a wrapping label box inside the SVG, including the left/right axes.
          const width = 64
          const x = Math.max(0, Math.min(VIEW - width, point.x - width / 2))
          const y = Math.max(0, Math.min(VIEW - 32, point.y - 16))
          return (
            <foreignObject key={i} x={x} y={y} width={width} height={32}>
              <div className="flex h-full items-center justify-center break-words text-center text-ink-sub" style={{ fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>
                {axis.label}
              </div>
            </foreignObject>
          )
        })}
      </svg>
      {axes.some((axis) => axis.detail) && (
        <ul className="mt-2 space-y-1 text-xs text-ink-sub">
          {axes.filter((axis) => axis.detail).map((axis) => <li key={axis.label}>{axis.label}: {axis.detail}</li>)}
        </ul>
      )}
    </div>
  )
}
