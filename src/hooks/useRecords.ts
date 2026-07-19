import { useQuery } from '@tanstack/react-query'
import type { RecordsResponse } from '../../shared/domain'
import { isPlainObject } from '../../shared/is-plain-object'
import { ApiError, UnauthorizedError } from '../lib/api-error'
import { parseRecordsResponse } from '../lib/parse-records-response'

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
    const body: unknown = await res.json().catch(() => null)
    const message = isPlainObject(body) && typeof body.message === 'string' ? body.message : null
    throw new ApiError(message ?? `records fetch failed (${res.status})`, res.status)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    // 서버 계약상 200 본문은 항상 JSON이지만, 깨진 페이로드도 ApiError 타입 계약 안에서 실패시킨다.
    throw new ApiError('records fetch failed (invalid json)', res.status)
  }

  // JSON이지만 계약(shared/domain.ts)을 위반한 바디(#93) — invalid json과 같은 분류로
  // ApiError에 안착시킨다. status 200은 4xx가 아니라 재시도 규칙도 동일하게 적용된다.
  const parsed = parseRecordsResponse(body)
  if (parsed === null) throw new ApiError('records fetch failed (invalid body)', res.status)
  return parsed
}

// 4xx(401 로그인 필요 포함)는 요청 자체의 문제라 재시도해도 소용없어 제외한다.
// 그 외 실패(네트워크·5xx)는 TanStack 기본 재시도 상한(3회 시도)과 동일하게 최대 2회까지 재시도한다.
export function shouldRetryRecordsQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 2
}

// 소비 측(예: LoginGate의 로그인 성공 후 invalidateQueries)이 문자열을 중복 기재하지
// 않고 이 키를 그대로 재사용하도록 export한다 — 키가 바뀌어도 한 곳만 고치면 된다.
export const RECORDS_QUERY_KEY = ['records'] as const

export function useRecords() {
  return useQuery<RecordsResponse, ApiError>({
    queryKey: RECORDS_QUERY_KEY,
    queryFn: ({ signal }) => fetchRecords(signal),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryRecordsQuery,
  })
}
