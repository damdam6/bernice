// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExemptToggle } from './ExemptToggle'

afterEach(cleanup)

describe('ExemptToggle', () => {
  it('checked=false → aria-checked=false, primary 배경 아님', () => {
    render(<ExemptToggle checked={false} onChange={() => {}} />)

    const toggle = screen.getByRole('switch', { name: '면제' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle.className).toContain('bg-neutral-tint')
  })

  it('checked=true → aria-checked=true, primary 배경', () => {
    render(<ExemptToggle checked onChange={() => {}} />)

    const toggle = screen.getByRole('switch', { name: '면제' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle.className).toContain('bg-primary')
  })

  it('클릭하면 반대 값으로 onChange를 호출한다', () => {
    const onChange = vi.fn()
    render(<ExemptToggle checked={false} onChange={onChange} />)

    fireEvent.click(screen.getByRole('switch', { name: '면제' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })
})
