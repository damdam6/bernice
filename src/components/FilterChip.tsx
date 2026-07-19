import type { ReactNode } from 'react'

type FilterChipProps = {
  active: boolean
  onClick: () => void
  children: ReactNode
}

// 필터 칩 — §06: 활성 primary 배경/흰 글자/700, 비활성 흰 배경/chip-ink/600 + chip-line 보더.
// 가로 스크롤 컨테이너(overflow-x-auto 등)는 호출자 책임.
export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-chip px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
        active
          ? 'bg-primary font-bold text-white'
          : 'border border-chip-line bg-white font-semibold text-chip-ink'
      }`}
    >
      {children}
    </button>
  )
}
