import type { TooltipContentProps } from 'recharts'

export interface ChartTooltipProps extends TooltipContentProps {
  valueFormatter?: (value: number | string, name: string) => string
}

// 두 프리셋(라인·레이더)이 공유하는 툴팁 — App.tsx 카드 톤(흰 배경·line 테두리)과 통일.
export function ChartTooltip({ active, payload, label, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm">
      {label !== undefined && <p className="mb-1 font-semibold text-ink">{label}</p>}
      <ul className="space-y-1">
        {payload.map((entry, index) => {
          const name = String(entry.name ?? '')
          const rawValue = entry.value
          const displayValue =
            valueFormatter && (typeof rawValue === 'number' || typeof rawValue === 'string')
              ? valueFormatter(rawValue, name)
              : String(rawValue)

          return (
            <li
              key={`${String(entry.dataKey ?? name)}-${index}`}
              className="flex items-center gap-1.5 text-ink-sub"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>{name}</span>
              <span className="ml-auto font-semibold text-ink">{displayValue}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
