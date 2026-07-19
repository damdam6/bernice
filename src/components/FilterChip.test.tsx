// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterChip } from './FilterChip'

afterEach(cleanup)

describe('FilterChip', () => {
  it('활성 상태 — primary 배경 + aria-pressed=true', () => {
    render(
      <FilterChip active onClick={() => {}}>
        셔틀런
      </FilterChip>,
    )
    const button = screen.getByRole('button', { name: '셔틀런' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button.className).toContain('bg-primary')
  })

  it('비활성 상태 — chip-ink/chip-line + aria-pressed=false', () => {
    render(
      <FilterChip active={false} onClick={() => {}}>
        골밑슛
      </FilterChip>,
    )
    const button = screen.getByRole('button', { name: '골밑슛' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button.className).toContain('text-chip-ink')
    expect(button.className).toContain('border-chip-line')
  })

  it('클릭하면 onClick이 호출된다', () => {
    const onClick = vi.fn()
    render(
      <FilterChip active={false} onClick={onClick}>
        자유투
      </FilterChip>,
    )

    fireEvent.click(screen.getByRole('button', { name: '자유투' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
