// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MobileFrame } from './MobileFrame'

afterEach(cleanup)

describe('MobileFrame', () => {
  it('children을 중앙정렬 max-width 컨테이너로 감싼다', () => {
    render(
      <MobileFrame>
        <span>내용</span>
      </MobileFrame>,
    )

    const frame = screen.getByText('내용').parentElement
    expect(frame).toHaveClass('mx-auto', 'w-full', 'max-w-frame')
  })

  it('전달한 className을 프레임 폭 클래스에 병합한다', () => {
    render(
      <MobileFrame className="flex flex-1 flex-col pb-16">
        <span>내용</span>
      </MobileFrame>,
    )

    const frame = screen.getByText('내용').parentElement
    expect(frame).toHaveClass('max-w-frame', 'flex', 'flex-1', 'flex-col', 'pb-16')
  })
})
