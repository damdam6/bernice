// 관리자 제출 흐름 공통 훅(#95) — AddPlayers·CreateSheet·RecordsPlayerInput 세 화면이
// 복제하던 패턴(submitting·submitError 상태 → API 호출 → 실패 시 메시지 노출·화면 유지,
// 성공 시 records 캐시 무효화 → 화면별 성공 처리)을 하나로 모은다. PR #91에서 "rule of
// three(3번째 사례 #68) 나오면 추출"로 보류됐고, #68 머지로 세 사례가 충족됐다.
//
// 세 API 래퍼(add-players-api·create-sheet-api·records-write-api)가 모두
// { ok: true, … } | { ok: false, message } 로 항상 resolve하는(네트워크 오류도 ok:false로
// 변환) 계약을 공유하므로, 이 훅은 그 계약을 믿고 결과를 분기한다. 다만 재사용 훅이라
// 계약을 어긴 mutationFn(예상치 못한 throw)이 들어와도 UI가 잠기지 않도록 방어적 try/catch를
// 한 겹 둔다 — 잡으면 submitError를 세우고 submitting을 되돌려 버튼이 "…하는 중"에 고정되는
// 사일런트 실패를 막는다.
//
// 무효화 대상(RECORDS_QUERY_KEY, exact)은 세 화면이 동일해서 훅에 내장한다 — 이 한 줄이
// 중복의 핵심이다. 다른 캐시가 필요한 화면이 생기면 그때 매개변수화한다(현재 YAGNI).
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RECORDS_QUERY_KEY } from './useRecords'

export interface SubmitMutationSuccess {
  ok: true
}

export interface SubmitMutationFailure {
  ok: false
  message: string
}

export function useSubmitMutation() {
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 회차 전환처럼 제출 밖에서 이전 실패 메시지를 지워야 하는 경우를 위해 노출한다(AddPlayers).
  const clearError = useCallback(() => setSubmitError(null), [])

  // 제출 시점의 최신 상태(선택·입력)를 읽어야 하므로 mutationFn을 호출 시점에 thunk로 받는다 —
  // 설정형이면 렌더마다 바뀌는 값에 stale-closure가 생긴다.
  // mutationFn의 반환 유니온 R 전체에서 추론하고(성공만 넘기면 실패 멤버가 빠져 추론이 base
  // 제약으로 무너진다), 성공 콜백엔 Extract로 성공 멤버만 뽑아 넘긴다.
  const submit = useCallback(
    async <R extends SubmitMutationSuccess | SubmitMutationFailure>(
      mutationFn: () => Promise<R>,
      onSuccess: (result: Extract<R, { ok: true }>) => void | Promise<void>,
    ) => {
      setSubmitting(true)
      setSubmitError(null)

      let result: R
      try {
        result = await mutationFn()
      } catch {
        // 계약상 여기까지 오면 안 되지만(래퍼가 항상 resolve), 계약을 어긴 호출에도 UI가
        // 잠기지 않도록 방어한다 — 일반 오류 문구를 세우고 다시 시도할 수 있게 풀어준다.
        setSubmitError('예상치 못한 오류로 처리하지 못했어요. 다시 시도해주세요.')
        setSubmitting(false)
        return
      }

      if (!result.ok) {
        setSubmitError(result.message)
        // 실패 → 화면에 머문다. 컴포넌트가 언마운트되지 않아 선택·입력값이 그대로 남고, 다시
        // 누르면 재시도된다. 그래서 별도의 보존/재시도 코드가 필요 없다.
        setSubmitting(false)
        return
      }

      // 성공 콜백 직전에 무효화한다(원본 순서 유지) — navigate로 넘어간 화면이 최신 데이터를 본다.
      await queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY, exact: true })
      // 성공은 navigate로 언마운트되므로 submitting을 되돌리지 않는다(원본과 동일).
      await onSuccess(result as Extract<R, { ok: true }>)
    },
    [queryClient],
  )

  return { submitting, submitError, submit, clearError }
}
