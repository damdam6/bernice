interface ErrorPanelProps {
  title?: string
  message: string
  /** 제목 헤딩 태그 — 쓰이는 화면의 헤딩 계층에 맞춰 조정 (기본 h2) */
  titleAs?: 'h2' | 'h3'
  /** 있으면 재시도 버튼을 렌더 */
  onRetry?: () => void
}

export function ErrorPanel({ title = '문제가 발생했어요', message, titleAs: Title = 'h2', onRetry }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className="w-full max-w-md rounded-card border border-line bg-white p-8 text-center shadow-sm"
    >
      <p className="text-4xl">⚠️</p>
      <Title className="mt-3 text-lg font-bold text-ink">{title}</Title>
      <p className="mt-2 text-sm text-ink-sub">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
        >
          다시 시도
        </button>
      )}
    </div>
  )
}
