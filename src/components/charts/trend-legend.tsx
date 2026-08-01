import type { ReactNode } from 'react'

const MARKER_WIDTH = 14
const MARKER_HEIGHT = 8
const MARKER_MID = MARKER_HEIGHT / 2

// 추이 차트 범례 — 마커는 TrendChart와 같은 색 클래스를 쓴다(#171). 한쪽만 바뀌면
// 범례가 거짓을 말하므로 색·굵기는 여기서 새로 정하지 않고 §07 스펙을 그대로 축소한다.
// 점선만 4 4 → 3 2로 좁힌다 — 14px 폭에서 4 4는 칸이 한두 개뿐이라 실선으로 읽힌다.
const ITEMS: { label: string; marker: ReactNode }[] = [
  {
    label: '본인',
    marker: (
      <>
        <line x1={0} x2={MARKER_WIDTH} y1={MARKER_MID} y2={MARKER_MID} strokeWidth={2.4} className="stroke-primary" />
        <circle cx={MARKER_WIDTH / 2} cy={MARKER_MID} r={2.4} className="fill-primary" />
      </>
    ),
  },
  {
    label: '팀원',
    marker: (
      <line x1={0} x2={MARKER_WIDTH} y1={MARKER_MID} y2={MARKER_MID} strokeWidth={1.6} className="stroke-primary-soft" />
    ),
  },
  {
    label: '목표',
    marker: (
      <line
        x1={0}
        x2={MARKER_WIDTH}
        y1={MARKER_MID}
        y2={MARKER_MID}
        strokeWidth={1.5}
        strokeDasharray="3 2"
        className="stroke-good"
      />
    ),
  },
]

// "종목별 성장" 섹션 헤더에 상시 노출되는 소형 범례 — 카드 확장 여부와 무관(#171).
// 축 눈금도 값 라벨도 없는 차트라 연보라 배경 라인의 의미를 화면 안에서 알 길이 없었다.
// 항목마다 whitespace-nowrap: 좁은 폭에서 줄바꿈은 항목 경계에서만 일어나야 한다.
export function TrendLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-sub" aria-label="추이 차트 범례">
      {ITEMS.map(({ label, marker }) => (
        <span key={label} className="flex items-center gap-1 whitespace-nowrap">
          <svg
            viewBox={`0 0 ${MARKER_WIDTH} ${MARKER_HEIGHT}`}
            width={MARKER_WIDTH}
            height={MARKER_HEIGHT}
            aria-hidden="true"
            className="shrink-0"
          >
            {marker}
          </svg>
          {label}
        </span>
      ))}
    </span>
  )
}
