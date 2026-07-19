// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimeScoreInput } from './TimeScoreInput'

afterEach(cleanup)

describe('TimeScoreInput', () => {
  it('분·초 값을 각 필드에 표시한다', () => {
    render(<TimeScoreInput minutes="1" seconds="12" onChange={() => {}} />)

    expect(screen.getByLabelText('분')).toHaveValue('1')
    expect(screen.getByLabelText('초')).toHaveValue('12')
  })

  it('분 필드를 바꾸면 seconds는 유지한 채 onChange를 호출한다', () => {
    const onChange = vi.fn()
    render(<TimeScoreInput minutes="1" seconds="12" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('분'), { target: { value: '2' } })

    expect(onChange).toHaveBeenCalledWith({ minutes: '2', seconds: '12' })
  })

  it('숫자가 아닌 문자는 걸러낸다', () => {
    const onChange = vi.fn()
    render(<TimeScoreInput minutes="" seconds="" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('초'), { target: { value: 'a5b' } })

    expect(onChange).toHaveBeenCalledWith({ minutes: '', seconds: '5' })
  })

  it('error가 있으면 alert로 노출한다', () => {
    render(<TimeScoreInput minutes="1" seconds="75" onChange={() => {}} error="초는 0–59만 입력할 수 있어요" />)

    expect(screen.getByRole('alert')).toHaveTextContent('초는 0–59만 입력할 수 있어요')
  })

  it('error가 없으면 alert를 렌더하지 않는다', () => {
    render(<TimeScoreInput minutes="1" seconds="12" onChange={() => {}} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
