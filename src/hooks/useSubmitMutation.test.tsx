// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { RECORDS_QUERY_KEY } from './useRecords'
import { useSubmitMutation } from './useSubmitMutation'

afterEach(() => {
  vi.restoreAllMocks()
})

function setup() {
  const client = new QueryClient()
  // invalidateQueries는 실제 네트워크를 타지 않도록 스텁하되, 호출 여부·인자·순서를 검증한다.
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  const { result } = renderHook(() => useSubmitMutation(), { wrapper: Wrapper })
  return { result, invalidateSpy }
}

describe('useSubmitMutation', () => {
  it('초기값은 submitting: false, submitError: null', () => {
    const { result } = setup()
    expect(result.current.submitting).toBe(false)
    expect(result.current.submitError).toBeNull()
  })

  it('성공 → records 캐시를 무효화한 뒤 onSuccess에 성공 결과를 넘긴다', async () => {
    const { result, invalidateSpy } = setup()
    // onSuccess 시점에 무효화가 이미 끝나 있었는지로 순서를 검증한다(invocationCallOrder 미사용).
    let invalidatedBeforeSuccess = false
    const onSuccess = vi.fn(() => {
      invalidatedBeforeSuccess = invalidateSpy.mock.calls.length > 0
    })
    const success = { ok: true as const, sessionDate: '2026-07-19', added: [{ playerId: 1, name: '가은' }] }

    await act(async () => {
      await result.current.submit(async () => success, onSuccess)
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: RECORDS_QUERY_KEY, exact: true })
    expect(onSuccess).toHaveBeenCalledWith(success)
    // 무효화가 성공 콜백보다 먼저 실행돼야 넘어간 화면이 최신 데이터를 본다.
    expect(invalidatedBeforeSuccess).toBe(true)
    expect(result.current.submitError).toBeNull()
    // navigate 없이 머무는 onSuccess에서도 버튼이 잠기지 않도록 성공 후 submitting은 풀린다.
    expect(result.current.submitting).toBe(false)
  })

  it('실패 → submitError를 채우고 submitting을 되돌리며, 무효화·onSuccess는 하지 않는다', async () => {
    const { result, invalidateSpy } = setup()
    const onSuccess = vi.fn()

    await act(async () => {
      await result.current.submit(async () => ({ ok: false as const, message: '이미 참가자인 선수가 있습니다.' }), onSuccess)
    })

    expect(result.current.submitError).toBe('이미 참가자인 선수가 있습니다.')
    expect(result.current.submitting).toBe(false)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('mutationFn이 계약을 어기고 throw해도 UI가 잠기지 않는다 (일반 오류 노출 + submitting 복귀)', async () => {
    const { result, invalidateSpy } = setup()
    const onSuccess = vi.fn()

    await act(async () => {
      await result.current.submit(async () => {
        throw new Error('계약 위반')
      }, onSuccess)
    })

    expect(result.current.submitError).toBe('예상치 못한 오류로 처리하지 못했어요. 다시 시도해주세요.')
    expect(result.current.submitting).toBe(false)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('성공 후 onSuccess가 throw해도 submitting은 풀린다 (버튼 잠금 방지)', async () => {
    const { result } = setup()

    await act(async () => {
      // 예외는 호출부 버그로 전파되지만(finally가 삼키지 않음) 여기선 받아 테스트를 이어간다.
      await result.current
        .submit(
          async () => ({ ok: true as const }),
          () => {
            throw new Error('navigate 실패')
          },
        )
        .catch(() => {})
    })

    expect(result.current.submitting).toBe(false)
  })

  it('clearError()는 이전 실패 메시지를 지운다', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.submit(async () => ({ ok: false as const, message: '저장에 실패했어요.' }), vi.fn())
    })
    expect(result.current.submitError).toBe('저장에 실패했어요.')

    act(() => result.current.clearError())
    expect(result.current.submitError).toBeNull()
  })
})
