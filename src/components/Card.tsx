import type { ReactNode } from 'react'

type CardProps = {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-brand-200 bg-white p-6 shadow-sm${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}
