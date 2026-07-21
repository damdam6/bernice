import { useState } from 'react'
import { Check, ChevronDown, User } from 'lucide-react'
import type { PlayerSummary } from '../../shared/domain'

type PlayerSelectProps = {
  players: PlayerSummary[]
  selectedId: number
  onSelect: (id: number) => void
}

// 개인 프로필 선수 선택 드롭다운 — §05: 체크 표시 + 바깥 탭으로 닫힘.
// players[]는 탈퇴가 타입 수준에서 이미 제외(PlayerSummary.status)라 별도 필터가 필요 없다.
// 바깥 탭 닫힘은 목업과 동일하게 전면 오버레이 버튼으로 처리한다(document 리스너 대신 —
// 테스트가 쉽고 접근성 라벨을 붙일 수 있다).
export function PlayerSelect({ players, selectedId, onSelect }: PlayerSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = players.find((p) => p.id === selectedId) ?? players[0]

  return (
    <div className="relative z-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-card border border-input-line bg-white px-4 py-3 transition-colors hover:border-primary"
      >
        <span className="flex items-center gap-2.5">
          <User className="size-5 text-primary" aria-hidden />
          <span className="font-bold text-ink">{selected?.name}</span>
        </span>
        <ChevronDown
          className={`size-5 text-ink-sub transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div>
          {/* 바깥 탭 닫힘 — 전면 오버레이(목업의 position:fixed;inset:0과 동일) */}
          <button
            type="button"
            aria-label="선수 목록 닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-card border border-input-line bg-white py-1 shadow-lg"
          >
            {players.map((player) => {
              const active = player.id === selected?.id
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onSelect(player.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                      active ? 'font-bold text-primary' : 'font-medium text-ink'
                    }`}
                  >
                    <span>{player.name}</span>
                    {active && <Check className="size-4 text-primary" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
