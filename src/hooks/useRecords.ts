import { useQuery } from '@tanstack/react-query'
import type { RecordsResponse } from '../../shared/domain'
import { ApiError, UnauthorizedError } from '../lib/api-error'

interface ErrorBody {
  message?: string
}

export async function fetchRecords(): Promise<RecordsResponse> {
  const res = await fetch('/api/records')

  if (res.status === 401) throw new UnauthorizedError()

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorBody | null
    throw new ApiError(body?.message ?? `records fetch failed (${res.status})`, res.status)
  }

  return (await res.json()) as RecordsResponse
}

// 401은 로그인 상태 문제라 재시도해도 소용없어 제외한다. 그 외 실패(네트워크·502 등)는
// TanStack 기본 재시도 상한(3회 시도)과 동일하게 최대 2회까지 재시도한다.
export function shouldRetryRecordsQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof UnauthorizedError) return false
  return failureCount < 2
}

export function useRecords() {
  return useQuery<RecordsResponse, ApiError>({
    queryKey: ['records'],
    queryFn: fetchRecords,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryRecordsQuery,
  })
}
