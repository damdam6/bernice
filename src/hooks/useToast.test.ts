// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from './useToast'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToast', () => {
  it('초기값은 message: null', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.message).toBeNull()
  })

  it('show()를 호출하면 message가 채워진다', () => {
    const { result } = renderHook(() => useToast())

    act(() => result.current.show('✓ 저장됨'))

    expect(result.current.message).toBe('✓ 저장됨')
  })

  it('1.9초 후 자동으로 message가 사라진다', () => {
    const { result } = renderHook(() => useToast())

    act(() => result.current.show('✓ 저장됨'))
    act(() => vi.advanceTimersByTime(1900))

    expect(result.current.message).toBeNull()
  })

  it('소멸 전 다시 show()하면 타이머가 리셋된다', () => {
    const { result } = renderHook(() => useToast())

    act(() => result.current.show('첫 메시지'))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.show('두번째 메시지'))
    act(() => vi.advanceTimersByTime(1000))

    // 첫 타이머 기준이면 이미 지워졌을 시점이지만, 리셋됐으므로 두번째 메시지가 남아 있다.
    expect(result.current.message).toBe('두번째 메시지')

    act(() => vi.advanceTimersByTime(900))
    expect(result.current.message).toBeNull()
  })
})
