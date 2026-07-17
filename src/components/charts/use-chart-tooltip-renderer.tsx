import type { TooltipContentProps } from 'recharts'
import { useCallback } from 'react'
import { ChartTooltip } from './chart-tooltip'

// 라인·레이더 두 프리셋이 공유하는 Tooltip content 렌더러 — valueFormatter가 바뀔 때만 재생성된다.
export function useChartTooltipRenderer(valueFormatter?: (value: number | string, name: string) => string) {
  return useCallback(
    (props: TooltipContentProps) => <ChartTooltip {...props} valueFormatter={valueFormatter} />,
    [valueFormatter],
  )
}
