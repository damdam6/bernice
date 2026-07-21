// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GrowthCardDatum } from '../lib/profile-view'
import { GrowthStatCard } from './GrowthStatCard'

afterEach(cleanup)

const CARD: GrowthCardDatum = {
  eventKey: '골밑슛',
  label: '골밑슛',
  pb: '8',
  value: '8',
  delta: { text: '▲ 2', tone: 'up' },
}

describe('GrowthStatCard', () => {
  it('라벨·PB·현재값·델타를 렌더한다', () => {
    render(<GrowthStatCard card={CARD} expanded={false} onToggle={() => {}} />)
    expect(screen.getByText('골밑슛')).toBeInTheDocument()
    expect(screen.getByText('PB 8')).toBeInTheDocument()
    expect(screen.getByText('▲ 2')).toBeInTheDocument()
  })

  it('델타 톤에 따라 색 클래스가 갈린다', () => {
    const { rerender } = render(<GrowthStatCard card={CARD} expanded={false} onToggle={() => {}} />)
    expect(screen.getByText('▲ 2')).toHaveClass('text-good')

    rerender(
      <GrowthStatCard card={{ ...CARD, delta: { text: '▼ 5초', tone: 'down' } }} expanded={false} onToggle={() => {}} />,
    )
    expect(screen.getByText('▼ 5초')).toHaveClass('text-bad')

    rerender(
      <GrowthStatCard card={{ ...CARD, delta: { text: '─ 0', tone: 'muted' } }} expanded={false} onToggle={() => {}} />,
    )
    expect(screen.getByText('─ 0')).toHaveClass('text-ink-muted')
  })

  it('선택(expanded) 시 primary 보더, 아니면 기본 보더', () => {
    const { rerender } = render(<GrowthStatCard card={CARD} expanded={false} onToggle={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button.parentElement).toHaveClass('border-line')

    rerender(<GrowthStatCard card={CARD} expanded onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button').parentElement).toHaveClass('border-primary')
  })

  it('children은 expanded일 때만 렌더한다', () => {
    const { rerender } = render(
      <GrowthStatCard card={CARD} expanded={false} onToggle={() => {}}>
        <div data-testid="trend">차트</div>
      </GrowthStatCard>,
    )
    expect(screen.queryByTestId('trend')).not.toBeInTheDocument()

    rerender(
      <GrowthStatCard card={CARD} expanded onToggle={() => {}}>
        <div data-testid="trend">차트</div>
      </GrowthStatCard>,
    )
    expect(screen.getByTestId('trend')).toBeInTheDocument()
  })

  it('헤더를 탭하면 onToggle을 호출한다', () => {
    const onToggle = vi.fn()
    render(<GrowthStatCard card={CARD} expanded={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
