// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerSummary } from '../../shared/domain'
import { PlayerSelect } from './PlayerSelect'

afterEach(cleanup)

const PLAYERS: PlayerSummary[] = [
  { id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] },
  { id: 2, name: '선수2', status: '활동', trends: [], personalBests: [] },
  { id: 3, name: '선수3', status: '휴식', trends: [], personalBests: [] },
]

describe('PlayerSelect', () => {
  it('닫힌 상태에서는 트리거만 보이고 목록은 없다', () => {
    render(<PlayerSelect players={PLAYERS} selectedId={1} onSelect={() => {}} />)
    const trigger = screen.getByRole('button', { expanded: false })
    expect(trigger).toHaveTextContent('선수1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('트리거를 누르면 목록이 열리고 현재 선수에 체크(aria-selected)가 붙는다', () => {
    render(<PlayerSelect players={PLAYERS} selectedId={2} onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '선수2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: '선수1' })).toHaveAttribute('aria-selected', 'false')
  })

  it('항목을 선택하면 onSelect(id)를 호출하고 목록을 닫는다', () => {
    const onSelect = vi.fn()
    render(<PlayerSelect players={PLAYERS} selectedId={1} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    fireEvent.click(screen.getByRole('option', { name: '선수3' }))

    expect(onSelect).toHaveBeenCalledWith(3)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('바깥(오버레이)을 탭하면 목록이 닫힌다', () => {
    render(<PlayerSelect players={PLAYERS} selectedId={1} onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '선수 목록 닫기' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
