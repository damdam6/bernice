// 다중 선택 상태 — CreateSheet·AddPlayers(#67)의 선수 선택 리스트가 공유하는 동작.
import { useState } from 'react'

export function useMultiSelect() {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    setSelected(new Set())
  }

  return { selected, toggle, reset }
}
