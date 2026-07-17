import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  /** 제목 헤딩 태그 — 쓰이는 화면의 헤딩 계층에 맞춰 조정 (기본 h2) */
  titleAs?: 'h2' | 'h3'
  /** 선택적 CTA 슬롯 (버튼/링크 등) — 형태를 강제하지 않기 위해 children으로 둠 */
  children?: ReactNode
}

export function EmptyState({ icon = '🗂️', title, description, titleAs: Title = 'h2', children }: EmptyStateProps) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-8 text-center shadow-sm">
      <p className="text-4xl">{icon}</p>
      <Title className="mt-3 text-lg font-bold text-brand-900">{title}</Title>
      {description && <p className="mt-2 text-sm text-brand-700">{description}</p>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  )
}
