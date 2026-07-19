// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectablePlayerList } from './SelectablePlayerList'

afterEach(cleanup)

const PLAYERS = [
  { id: 1, name: '가은' },
  { id: 2, name: '나연' },
]

describe('SelectablePlayerList', () => {
  it('선수마다 행을 렌더하고 선택 상태를 aria-pressed로 표시한다', () => {
    render(<SelectablePlayerList players={PLAYERS} selected={new Set([1])} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: /가은/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /나연/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('행을 탭하면 onToggle이 그 선수 id로 호출된다', () => {
    const onToggle = vi.fn()
    render(<SelectablePlayerList players={PLAYERS} selected={new Set()} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: /나연/ }))

    expect(onToggle).toHaveBeenCalledWith(2)
  })
})
