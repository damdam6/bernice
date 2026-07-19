// 선수 다중 선택 리스트 — CreateSheet·AddPlayers(#67)가 공유하는 행 렌더링(§06 선택 리스트 행:
// 선택 시 primary-tint 배경 + primary 보더 + 우측 체크 사각).
interface SelectablePlayer {
  id: number
  name: string
}

interface SelectablePlayerListProps {
  players: SelectablePlayer[]
  selected: Set<number>
  onToggle: (id: number) => void
}

export function SelectablePlayerList({ players, selected, onToggle }: SelectablePlayerListProps) {
  return (
    <div className="flex flex-col gap-2">
      {players.map((player) => {
        const isSelected = selected.has(player.id)
        return (
          <button
            key={player.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(player.id)}
            className={`flex w-full items-center justify-between rounded-card border px-5 py-4 text-left transition-colors ${
              isSelected ? 'border-primary bg-primary-tint' : 'border-line bg-white'
            }`}
          >
            <span className="text-sm font-bold text-ink">{player.name}</span>
            <span
              className={`flex size-5 items-center justify-center rounded-md text-xs font-bold text-white ${
                isSelected ? 'bg-primary' : 'border border-input-line bg-transparent'
              }`}
            >
              {isSelected ? '✓' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
