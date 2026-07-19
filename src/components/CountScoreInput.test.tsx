// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CountScoreInput } from './CountScoreInput'

afterEach(cleanup)

describe('CountScoreInput', () => {
  it('현재 값과 만점 힌트를 표시한다', () => {
    render(<CountScoreInput value="6" maxScore={10} onChange={() => {}} />)

    expect(screen.getByLabelText('개수')).toHaveValue('6')
    expect(screen.getByText('/ 10')).toBeInTheDocument()
  })

  it('maxScore가 null이면 힌트를 표시하지 않는다', () => {
    render(<CountScoreInput value="" maxScore={null} onChange={() => {}} />)

    expect(screen.queryByText(/^\//)).not.toBeInTheDocument()
  })

  it('+ 버튼은 값을 1 증가시킨다', () => {
    const onChange = vi.fn()
    render(<CountScoreInput value="6" maxScore={10} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '증가' }))

    expect(onChange).toHaveBeenCalledWith('7')
  })

  it('+ 버튼은 만점에서 클램프한다', () => {
    const onChange = vi.fn()
    render(<CountScoreInput value="10" maxScore={10} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '증가' }))

    expect(onChange).toHaveBeenCalledWith('10')
  })

  it('− 버튼은 0 미만으로 내려가지 않는다', () => {
    const onChange = vi.fn()
    render(<CountScoreInput value="0" maxScore={10} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '감소' }))

    expect(onChange).toHaveBeenCalledWith('0')
  })

  it('빈 값에서 + 버튼을 누르면 0에서 시작해 1이 된다', () => {
    const onChange = vi.fn()
    render(<CountScoreInput value="" maxScore={10} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '증가' }))

    expect(onChange).toHaveBeenCalledWith('1')
  })

  it('직접 입력은 만점을 초과해도 그대로 반영한다', () => {
    const onChange = vi.fn()
    render(<CountScoreInput value="" maxScore={10} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('개수'), { target: { value: '99' } })

    expect(onChange).toHaveBeenCalledWith('99')
  })

  it('직접 입력에서 숫자가 아닌 문자는 걸러낸다', () => {
    const onChange = vi.fn()
    render(<CountScoreInput value="" maxScore={10} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('개수'), { target: { value: 'a3b' } })

    expect(onChange).toHaveBeenCalledWith('3')
  })
})
