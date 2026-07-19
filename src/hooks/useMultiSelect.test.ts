// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMultiSelect } from './useMultiSelect'

describe('useMultiSelect', () => {
  it('초기값은 빈 선택', () => {
    const { result } = renderHook(() => useMultiSelect())
    expect(result.current.selected.size).toBe(0)
  })

  it('toggle()을 호출하면 선택이 추가되고, 다시 호출하면 해제된다', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggle(1))
    expect(result.current.selected.has(1)).toBe(true)

    act(() => result.current.toggle(1))
    expect(result.current.selected.has(1)).toBe(false)
  })

  it('서로 다른 id는 독립적으로 선택된다', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggle(1))
    act(() => result.current.toggle(2))

    expect([...result.current.selected].sort()).toEqual([1, 2])
  })

  it('reset()은 선택을 모두 비운다', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggle(1))
    act(() => result.current.toggle(2))
    act(() => result.current.reset())

    expect(result.current.selected.size).toBe(0)
  })
})
