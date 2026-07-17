import { useQuery } from '@tanstack/react-query'
import type { RecordsResponse } from '../../shared/domain'
import { ApiError, UnauthorizedError } from '../lib/api-error'

interface ErrorBody {
  message?: string
}

export async function fetchRecords(signal?: AbortSignal): Promise<RecordsResponse> {
  let res: Response
  try {
    res = await fetch('/api/records', { signal })
  } catch (cause) {
    // 취소(abort)는 실패가 아니므로 래핑하지 않고 그대로 전파한다 — TanStack Query가 자체 처리한다.
    if (signal?.aborted) throw cause
    // HTTP 응답 자체가 없는 네트워크 오류. useQuery 제네릭이 error를 ApiError로 타입하므로
    // fetch의 TypeError를 그대로 흘리지 않고 status 0(XHR 관례)으로 래핑한다.
    throw new ApiError('records fetch failed (network)', 0)
  }

  if (res.status === 401) {
    // 본문을 읽지 않고 버리면 응답이 GC될 때까지 keep-alive 연결이 묶일 수 있어 명시적으로 취소한다.
    await res.body?.cancel()
    throw new UnauthorizedError()
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorBody | null
    throw new ApiError(body?.message ?? `records fetch failed (${res.status})`, res.status)
  }

  try {
    return (await res.json()) as RecordsResponse
  } catch {
    // 서버 계약상 200 본문은 항상 JSON이지만, 깨진 페이로드도 ApiError 타입 계약 안에서 실패시킨다.
    throw new ApiError('records fetch failed (invalid json)', res.status)
  }
}

// 4xx(401 로그인 필요 포함)는 요청 자체의 문제라 재시도해도 소용없어 제외한다.
// 그 외 실패(네트워크·5xx)는 TanStack 기본 재시도 상한(3회 시도)과 동일하게 최대 2회까지 재시도한다.
export function shouldRetryRecordsQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 2
}

export function useRecords() {
  return useQuery<RecordsResponse, ApiError>({
    queryKey: ['records'],
    queryFn: ({ signal }) => fetchRecords(signal),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryRecordsQuery,
  })
}
