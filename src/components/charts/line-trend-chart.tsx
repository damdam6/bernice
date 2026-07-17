import type { AxisDomainItem } from 'recharts'
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer } from './chart-container'
import {
  CHART_AXIS_LINE_COLOR,
  CHART_AXIS_TICK_STYLE,
  CHART_DEFAULT_HEIGHT,
  CHART_GRID_COLOR,
  CHART_LEGEND_STYLE,
  seriesColor,
} from './chart-theme'
import type { ChartSeries } from './chart-types'
import { useChartTooltipRenderer } from './use-chart-tooltip-renderer'

export interface LineTrendChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  series: ChartSeries[]
  height?: number
  xFormatter?: (value: string | number) => string
  yFormatter?: (value: number) => string
  valueFormatter?: (value: number | string, name: string) => string
  /**
   * Y축(값) 범위. 기본은 Recharts 기본값([0, 'auto']) — 회차마다 값이 0에서 멀리 떨어진 좁은
   * 구간(예: 셔틀런 70~80초)에 몰려 있으면 추이 변화가 시각적으로 눌려 보일 수 있다. 그럴 때
   * 호출자가 예: ['dataMin - 2', 'dataMax + 2']로 좁혀 지정한다.
   */
  yDomain?: readonly [AxisDomainItem, AxisDomainItem]
}

const CHART_MARGIN = { top: 8, right: 16, bottom: 4, left: 4 }

// 추이 프리셋 — 개인 프로필의 종목별 추이(단일 라인)와 전체 추이(멀티라인) 양쪽에서 재사용된다.
// 값 표시 형식(시간 vs 개수)은 xFormatter/yFormatter/valueFormatter로 호출자에게 위임한다.
export function LineTrendChart({
  data,
  xKey,
  series,
  height = CHART_DEFAULT_HEIGHT,
  xFormatter,
  yFormatter,
  valueFormatter,
  yDomain,
}: LineTrendChartProps) {
  const renderTooltip = useChartTooltipRenderer(valueFormatter)

  return (
    <ChartContainer height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={xFormatter}
          tick={CHART_AXIS_TICK_STYLE}
          axisLine={{ stroke: CHART_AXIS_LINE_COLOR }}
          tickLine={false}
        />
        <YAxis
          domain={yDomain}
          tickFormatter={yFormatter}
          tick={CHART_AXIS_TICK_STYLE}
          axisLine={{ stroke: CHART_AXIS_LINE_COLOR }}
          tickLine={false}
          width={40}
        />
        <Tooltip content={renderTooltip} />
        {series.length > 1 && <Legend wrapperStyle={CHART_LEGEND_STYLE} />}
        {series.map((s, index) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? seriesColor(index)}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
