import type { ReactNode } from 'react'
import type { DeltaTone, GrowthCardDatum } from '../lib/profile-view'
import { Pill } from './Pill'

type GrowthStatCardProps = {
  card: GrowthCardDatum
  /** 선택 여부 — true면 primary 보더 + 추이 차트 노출 */
  expanded: boolean
  onToggle: () => void
  /** 확장 시 노출할 추이 차트(선택) */
  children?: ReactNode
}

// 델타 색 — §06/§07: 개선 green, 악화 red, 첫 기록·미기록·동률 회색.
const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  up: 'text-good',
  down: 'text-bad',
  muted: 'text-ink-muted',
}

// 종목별 성장 카드 — §05: 종목명(+ 종료 종목이면 종료 뱃지) + PB + 현재값 + 델타. 탭하면 primary
// 보더로 선택되고 추이 차트(children)가 카드 안에서 확장된다(§05 "탭하면 카드가 primary 보더로
// 선택되고 추이 차트 확장"). 종료 뱃지는 선택 회차에 포함된 종목의 종료 상태를 나타낸다.
// 종목 포함 여부는 buildGrowthCards가 회차 ID로 결정한다.
export function GrowthStatCard({ card, expanded, onToggle, children }: GrowthStatCardProps) {
  return (
    <div
      className={`overflow-hidden rounded-card bg-white ${
        expanded ? 'border-[1.5px] border-primary' : 'border border-line'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="break-words font-bold text-ink">{card.label}</p>
            {card.ended && (
              <span className="shrink-0">
                <Pill colorClassName="bg-neutral-tint text-neutral-strong">종료</Pill>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-sub">PB {card.pb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold tabular-nums text-ink">{card.value}</p>
          <p className={`mt-0.5 text-sm font-bold tabular-nums ${DELTA_TONE_CLASS[card.delta.tone]}`}>
            {card.delta.text}
          </p>
        </div>
      </button>

      {expanded && children && <div className="border-t border-line px-3 pb-3 pt-1">{children}</div>}
    </div>
  )
}
