// 개수 종목 입력기(§05·§06) — 스테퍼(−/+, 46×46px·radius 13px) + 직접 입력.
// 스테퍼는 만점(maxScore)에서 상한 클램프, 하한은 0(normalize-score의 정수 전용 규칙과 일관).
// 직접 입력은 만점 초과를 허용한다(§08 "만점 초과는 막지 않는다") — 숫자 외 문자만 걸러낸다.
const DIGITS_ONLY = /\D/g

interface CountScoreInputProps {
  value: string
  maxScore: number | null
  onChange: (next: string) => void
  error?: string | null
}

export function CountScoreInput({ value, maxScore, onChange, error }: CountScoreInputProps) {
  function step(delta: number) {
    const current = value === '' ? 0 : Number(value)
    const next = clamp(current + delta, 0, maxScore)
    onChange(String(next))
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="감소"
          onClick={() => step(-1)}
          className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px] border border-input-line bg-white text-lg font-bold text-ink transition-colors hover:bg-canvas"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="개수"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(DIGITS_ONLY, ''))}
          className="w-16 rounded-[13px] border border-input-line bg-input-bg px-2 py-2 text-center text-[26px] font-extrabold text-ink"
        />
        <button
          type="button"
          aria-label="증가"
          onClick={() => step(1)}
          className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px] border border-input-line bg-white text-lg font-bold text-ink transition-colors hover:bg-canvas"
        >
          +
        </button>
        {maxScore !== null && <span className="text-sm text-ink-sub">/ {maxScore}</span>}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

function clamp(n: number, min: number, max: number | null): number {
  if (n < min) return min
  if (max !== null && n > max) return max
  return n
}
