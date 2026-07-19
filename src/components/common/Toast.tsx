interface ToastProps {
  message: string | null
}

// §06: 하단 중앙 다크(--color-ink) 필. 소멸 타이밍은 useToast가 관리 — 이 컴포넌트는 순수 표시만.
export function Toast({ message }: ToastProps) {
  if (!message) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(24px+env(safe-area-inset-bottom))] z-20 flex justify-center px-6"
    >
      <p className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{message}</p>
    </div>
  )
}
