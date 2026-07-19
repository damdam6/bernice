// 면제 토글(§06) — 48×28px 트랙 + 22px 노브, on=primary. 면제 가능 종목(exemptable-events.ts)에만
// 호출자가 렌더한다 — 이 컴포넌트 자체는 노출 제한을 모른다.
interface ExemptToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
}

export function ExemptToggle({ checked, onChange }: ExemptToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="면제"
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-neutral-tint'}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
