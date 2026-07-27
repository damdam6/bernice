// 데이터 새로 고침 오케스트레이션(#151) — 시트 관리 홈의 "데이터 새로 고침" 버튼이 쓴다.
// ① POST /api/refresh로 엣지 캐시 퍼지 → ② cache:'reload'로 브라우저 HTTP 캐시를 우회한
// refetch(응답이 브라우저 캐시 엔트리를 교체하고, records.ts의 cache.put이 엣지 캐시를
// 재적재해 팀원도 최신을 본다) → ③ setQueryData로 쿼리 캐시 즉시 갱신.
// 순서가 핵심이다 — 퍼지 전에 refetch하면 엣지의 옛 응답을 받아 브라우저 캐시에 다시
// 심으므로, ①이 실패하면 ②로 가지 않는다.
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RecordsResponse } from '../../shared/domain'
import { refreshRecordsCache } from '../lib/refresh-api'
import { RECORDS_QUERY_KEY, fetchRecords } from './useRecords'

export type RefreshRecordsResult = { ok: true } | { ok: false; message: string }

export function useRefreshRecords() {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async (): Promise<RefreshRecordsResult> => {
    setRefreshing(true)
    try {
      const purged = await refreshRecordsCache()
      if (!purged.ok) return purged

      let fresh: RecordsResponse
      try {
        fresh = await fetchRecords(undefined, 'reload')
      } catch {
        // fetchRecords의 ApiError 메시지는 개발자용 문구(영문 포함)라 그대로 노출하지 않는다.
        // 퍼지는 이미 성공했지만 다음 /api/records 조회가 시트 재조회로 자연 복구하므로
        // 사용자에겐 재시도 유도만 하면 된다.
        return { ok: false, message: '최신 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.' }
      }

      queryClient.setQueryData(RECORDS_QUERY_KEY, fresh)
      return { ok: true }
    } finally {
      setRefreshing(false)
    }
  }, [queryClient])

  return { refreshing, refresh }
}
