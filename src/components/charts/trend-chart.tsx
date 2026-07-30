import { useId } from 'react'
import type { TrendDomain, TrendLayout, TrendPointDatum } from './trend-math'
import { hasVisibleSegment, polylinePoints, renderablePoints, trendDomain, trendX, trendY } from './trend-math'

export type { TrendPointDatum } from './trend-math'

export interface TrendChartProps {
  /** x축 회차 라벨 — 날짜 오름차순 ("1차", "2차", …). 파생 규칙은 화면 쪽 책임(§09) */
  sessionLabels: string[]
  /** 본인 라인 — 유효 기록 회차만(희소 허용). value는 종목 원값 */
  highlight: TrendPointDatum[]
  /** 전체 선수 배경 라인들 — 본인 제외 여부는 호출자가 정한다 */
  background?: TrendPointDatum[][]
  /** 목표선 원값 — EventDefinition.targetValue(시간=초, 개수=그대로). 축 범위에 항상 포함된다 */
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
// (primary 3.2px + 도트 r3.6), 목표선은 good 1.5px 점선(4 4). x = 회차, y = 종목 원값(#172).
// 축 눈금·값 라벨은 두지 않는다 — 수치는 카드 헤더(현재값·PB·델타)가 담당하고 차트는 모양만 맡는다.
// 희소 기록 처리(#174): 본인 점이 0개면 빈 좌표축 대신 문구, 도메인은 최소 폭이 보장되고,
// 도메인과 교차하는 구간이 없는 배경 시리즈는 렌더에서 빠진다.
export function TrendChart({
  sessionLabels,
  highlight,
  background = [],
  goal,
  height = DEFAULT_HEIGHT,
  label = '종목 추이',
}: TrendChartProps) {
  // 훅은 조건 분기 앞에서 호출한다. useId 값의 콜론은 지워 querySelector·url(#id) 양쪽에서 안전하게.
  const clipId = `trend-clip-${useId().replace(/:/g, '')}`
  if (sessionLabels.length === 0) return null

  const layout: TrendLayout = { width: VIEW_WIDTH, height, padX: 18, padTop: 12, padBottom: 26 }
  const count = sessionLabels.length
  const points = renderablePoints(highlight, count)
  // 본인 기록이 없으면 점도 선도 없는 빈 좌표축이 그려진다 — 차트 대신 문구를 낸다(#174).
  // 카드 헤더(PB·현재값·델타)는 GrowthStatCard 소관이라 그대로 남는다.
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-sub">아직 기록이 없습니다</p>
  }

  // 축 범위는 본인 점 ∪ 목표값 — 배경 라인은 제외된다(#172). 좁은 범위는 최소 폭까지 넓혀진다(#174).
  const domain: TrendDomain = trendDomain(points, goal, background)
  const goalY = goal === undefined ? null : trendY(goal, domain, layout)
  const bandHeight = height - layout.padTop - layout.padBottom
  // 도메인과 교차하는 구간이 없는 배경 시리즈는 클립되면 세로 막대 토막만 남으므로 아예 뺀다(#174).
  const visibleBackground = background.filter((series) => hasVisibleSegment(series, count, domain))

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} ${height}`} width="100%" role="img" aria-label={label}>
      {/* 배경 라인은 축 범위를 벗어난 구간이 잘려 보인다 — 가장자리 클램프는 값 왜곡이라 쓰지 않는다(#172) */}
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={layout.padTop} width={VIEW_WIDTH} height={bandHeight} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {visibleBackground.map((series, i) => (
          <polyline
            key={i}
            points={polylinePoints(series, count, layout, domain)}
            fill="none"
            strokeWidth={1.6}
            className="stroke-primary-soft"
          />
        ))}
      </g>
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
        points={polylinePoints(points, count, layout, domain)}
        fill="none"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
      />
      {points.map((point) => (
        <circle
          key={point.sessionIndex}
          cx={trendX(point.sessionIndex, count, layout)}
          cy={trendY(point.value, domain, layout)}
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
