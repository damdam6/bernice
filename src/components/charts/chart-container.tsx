import type { ReactElement } from 'react'
import { ResponsiveContainer } from 'recharts'
import { CHART_DEFAULT_HEIGHT } from './chart-theme'

export interface ChartContainerProps {
  height?: number
  children: ReactElement
}

// 순수 반응형 래퍼 — 카드 크롬(테두리/배경)은 그리지 않는다. 페이지 쪽에서 카드 컴포넌트로 감싼다.
export function ChartContainer({ height = CHART_DEFAULT_HEIGHT, children }: ChartContainerProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
  )
}
