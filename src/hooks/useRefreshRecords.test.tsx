// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { RecordsResponse } from '../../shared/domain'
import { RECORDS_QUERY_KEY } from './useRecords'
import { useRefreshRecords, type RefreshRecordsResult } from './useRefreshRecords'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

const RECORDS_BODY: RecordsResponse = {
  generatedAt: '2026-07-28T00:00:00.000Z',
  events: [],
  players: [],
  sessions: [],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useRefreshRecords', () => {
  it('퍼지 → reload refetch 순서로 호출하고 쿼리 캐시를 갱신한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { deleted: true }))
      .mockResolvedValueOnce(jsonResponse(200, RECORDS_BODY))
    vi.stubGlobal('fetch', fetchMock)
    const { client, wrapper } = createWrapper()
    const { result } = renderHook(() => useRefreshRecords(), { wrapper })

    let outcome: RefreshRecordsResult | undefined
    await act(async () => {
      outcome = await result.current.refresh()
    })

    expect(outcome).toEqual({ ok: true })
    expect(fetchMock.mock.calls[0]).toEqual(['/api/refresh', { method: 'POST' }])
    expect(fetchMock.mock.calls[1]).toEqual(['/api/records', { signal: undefined, cache: 'reload' }])
    expect(client.getQueryData(RECORDS_QUERY_KEY)).toEqual(RECORDS_BODY)
  })

  it('퍼지 실패면 records를 refetch하지 않고 서버 message로 ok:false를 반환한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'unauthorized', message: '로그인이 필요합니다.' }))
    vi.stubGlobal('fetch', fetchMock)
    const { client, wrapper } = createWrapper()
    const { result } = renderHook(() => useRefreshRecords(), { wrapper })

    let outcome: RefreshRecordsResult | undefined
    await act(async () => {
      outcome = await result.current.refresh()
    })

    expect(outcome).toEqual({ ok: false, message: '로그인이 필요합니다.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(RECORDS_QUERY_KEY)).toBeUndefined()
  })

  it('refetch 실패(502)면 한국어 실패 메시지로 ok:false를 반환한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { deleted: true }))
      .mockResolvedValueOnce(jsonResponse(502, { error: 'sheets_api_error', message: '시트 실패' }))
    vi.stubGlobal('fetch', fetchMock)
    const { client, wrapper } = createWrapper()
    const { result } = renderHook(() => useRefreshRecords(), { wrapper })

    let outcome: RefreshRecordsResult | undefined
    await act(async () => {
      outcome = await result.current.refresh()
    })

    expect(outcome).toEqual({
      ok: false,
      message: '최신 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
    })
    expect(client.getQueryData(RECORDS_QUERY_KEY)).toBeUndefined()
  })

  it('진행 중에는 refreshing=true, 완료 후 false로 돌아온다', async () => {
    let releasePurge!: (value: Response) => void
    const purgePromise = new Promise<Response>((resolve) => {
      releasePurge = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(purgePromise)
      .mockResolvedValueOnce(jsonResponse(200, RECORDS_BODY))
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useRefreshRecords(), { wrapper })

    let refreshPromise!: Promise<RefreshRecordsResult>
    act(() => {
      refreshPromise = result.current.refresh()
    })
    await waitFor(() => expect(result.current.refreshing).toBe(true))

    releasePurge(jsonResponse(200, { deleted: true }))
    await act(async () => {
      await refreshPromise
    })
    expect(result.current.refreshing).toBe(false)
  })
})
