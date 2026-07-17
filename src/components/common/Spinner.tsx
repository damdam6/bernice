type SpinnerSize = 'sm' | 'md'

interface SpinnerProps {
  size?: SpinnerSize
  /** 스크린리더 전용 레이블 (화면엔 보이지 않음) */
  label?: string
}

const SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: 'size-5 border-2',
  md: 'size-8 border-[3px]',
}

export function Spinner({ size = 'md', label = '불러오는 중…' }: SpinnerProps) {
  return (
    <div className="inline-flex items-center justify-center" role="status">
      <span
        className={`inline-block animate-spin rounded-full border-brand-100 border-t-brand-600 ${SIZE_CLASS[size]}`}
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}
