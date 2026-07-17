import type { ReactNode } from 'react'

type PillProps = {
  colorClassName: string
  children: ReactNode
}

export function Pill({ colorClassName, children }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colorClassName}`}
    >
      {children}
    </span>
  )
}
