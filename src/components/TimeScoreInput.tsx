// 시간 종목 입력기(§05·§06) — 분·초 2필드, inputmode=numeric 숫자 키패드, 26px/800.
// 형식 검증(초 0–59 등)은 호출자가 buildEventScore(shared/)로 판정해 error로 내려준다 —
// 이 컴포넌트는 숫자 외 문자만 걸러내는 입력 정제만 맡고 검증 규칙을 갖지 않는다.
const DIGITS_ONLY = /\D/g

interface TimeScoreInputProps {
  /** 접근성 라벨 접두어 — 종목 카드 하나에 여러 인스턴스가 동시에 렌더되므로 "분"/"초"만으로는
   *  스크린리더가 어느 종목인지 구분할 수 없다. 호출자가 event.key를 넘긴다. */
  label: string
  minutes: string
  seconds: string
  onChange: (next: { minutes: string; seconds: string }) => void
  error?: string | null
}

export function TimeScoreInput({ label, minutes, seconds, onChange, error }: TimeScoreInputProps) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`${label} 분`}
          value={minutes}
          onChange={(e) => onChange({ minutes: e.target.value.replace(DIGITS_ONLY, ''), seconds })}
          className="w-16 rounded-[13px] border border-input-line bg-input-bg px-2 py-2 text-center text-[26px] font-extrabold text-ink"
        />
        <span className="text-lg font-bold text-ink-sub">:</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`${label} 초`}
          value={seconds}
          onChange={(e) => onChange({ minutes, seconds: e.target.value.replace(DIGITS_ONLY, '') })}
          className="w-16 rounded-[13px] border border-input-line bg-input-bg px-2 py-2 text-center text-[26px] font-extrabold text-ink"
        />
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-bad">
          {error}
        </p>
      )}
    </div>
  )
}
