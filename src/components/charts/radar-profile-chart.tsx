import type { AxisDomainItem } from 'recharts'
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Tooltip } from 'recharts'
import { ChartContainer } from './chart-container'
import { ChartTooltip } from './chart-tooltip'
import { CHART_AXIS_TICK_STYLE, CHART_GRID_COLOR, CHART_LEGEND_STYLE, seriesColor } from './chart-theme'
import type { ChartSeries } from './line-trend-chart'

export interface RadarProfileChartProps {
  data: Array<Record<string, unknown>>
  axisKey: string
  series: ChartSeries[]
  height?: number
  /**
   * 반지름(값) 축 범위 — 기본 ['auto', 'auto'] (데이터 min/max로 자동 계산).
   * 축마다 단위가 다른 원값(예: 셔틀런 초 vs 골밑슛 개수)을 그대로 얹으면 시각적으로 비교되지 않는다 —
   * 이 프리셋은 정규화하지 않으므로, 여러 종목을 한 레이더에 같이 그릴 때는 호출자가 값을 먼저
   * 정규화(예: 목표 대비 %)한 뒤 domain을 명시적으로 지정해야 한다.
   */
  domain?: readonly [AxisDomainItem, AxisDomainItem]
  valueFormatter?: (value: number | string, name: string) => string
}

const DEFAULT_HEIGHT = 280
const DEFAULT_DOMAIN: readonly [AxisDomainItem, AxisDomainItem] = ['auto', 'auto']

// 개인 프로필의 종목별 스킬 프로필용 레이더 프리셋.
export function RadarProfileChart({
  data,
  axisKey,
  series,
  height = DEFAULT_HEIGHT,
  domain = DEFAULT_DOMAIN,
  valueFormatter,
}: RadarProfileChartProps) {
  return (
    <ChartContainer height={height}>
      <RadarChart data={data}>
        <PolarGrid stroke={CHART_GRID_COLOR} />
        <PolarAngleAxis dataKey={axisKey} tick={CHART_AXIS_TICK_STYLE} />
        <PolarRadiusAxis domain={domain} tick={{ ...CHART_AXIS_TICK_STYLE, fontSize: 10 }} angle={90} />
        <Tooltip content={(props) => <ChartTooltip {...props} valueFormatter={valueFormatter} />} />
        {series.length > 1 && <Legend wrapperStyle={CHART_LEGEND_STYLE} />}
        {series.map((s, index) => {
          const color = s.color ?? seriesColor(index)
          return (
            <Radar key={s.key} dataKey={s.key} name={s.label} stroke={color} fill={color} fillOpacity={0.25} />
          )
        })}
      </RadarChart>
    </ChartContainer>
  )
}
