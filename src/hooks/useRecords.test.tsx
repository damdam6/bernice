// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { RecordsResponse } from '../../shared/domain'
import { ApiError, UnauthorizedError } from '../lib/api-error'
import { fetchRecords, shouldRetryRecordsQuery, useRecords } from './useRecords'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

const RECORDS_BODY: RecordsResponse = {
  generatedAt: '2026-07-17T00:00:00.000Z',
  events: [],
  players: [],
  sessions: [],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

describe('fetchRecords', () => {
  it('200 응답이면 RecordsResponse를 그대로 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    await expect(fetchRecords()).resolves.toEqual(RECORDS_BODY)
  })

  it('401 응답이면 UnauthorizedError를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' })))

    await expect(fetchRecords()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('기타 실패(502)는 에러 바디의 message·status를 담은 ApiError를 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(502, { error: 'sheets_api_error', message: '시트 실패' })),
    )

    const error: unknown = await fetchRecords().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
    expect((error as ApiError).message).toBe('시트 실패')
  })

  it('에러 바디를 JSON으로 파싱할 수 없으면 상태 코드로 기본 메시지를 만든다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })))

    const error: unknown = await fetchRecords().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(500)
    expect((error as ApiError).message).toBe('records fetch failed (500)')
  })
})

describe('shouldRetryRecordsQuery', () => {
  it('UnauthorizedError면 failureCount와 무관하게 항상 false', () => {
    expect(shouldRetryRecordsQuery(0, new UnauthorizedError())).toBe(false)
    expect(shouldRetryRecordsQuery(5, new UnauthorizedError())).toBe(false)
  })

  it('그 외 에러는 failureCount < 2 구간에서만 true', () => {
    const error = new ApiError('boom', 502)
    expect(shouldRetryRecordsQuery(0, error)).toBe(true)
    expect(shouldRetryRecordsQuery(1, error)).toBe(true)
    expect(shouldRetryRecordsQuery(2, error)).toBe(false)
  })
})

function createWrapper() {
  const client = new QueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useRecords', () => {
  it('성공 시 타입 적용된 데이터를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    const { result } = renderHook(() => useRecords(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(RECORDS_BODY)
  })

  it('401이면 UnauthorizedError를 반환하고 재시도하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRecords(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(UnauthorizedError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
