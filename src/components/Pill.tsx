import type { ReactNode } from 'react'

type PillProps = {
  colorClassName: string
  children: ReactNode
}

export function Pill({ colorClassName, children }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2.5 py-1 text-[11px] font-bold ${colorClassName}`}
    >
      {children}
    </span>
  )
}
