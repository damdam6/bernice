// 관리자 스택 보호 게이트(#67) — LoginGate(#47)와 대칭 구조. useRecords()의 401을 인증 신호로
// 재사용해(같은 쿼리 상태가 유일한 진실 공급원) 미인증 접근을 /admin/login으로 돌려보낸다.
// /admin/login 자체는 이 게이트 밖에 있다 — 안에 두면 미인증 상태의 로그인 화면 진입이
// 곧바로 401을 만나 자기 자신으로 리다이렉트를 시도하는 순환이 생긴다.
//
// 알려진 한계: team 세션도 GET /api/records는 통과하므로(_middleware.ts가 /api/admin/*만
// admin role을 요구) 이 게이트를 지나 시트 관리 화면을 볼 수 있다 — 실제 쓰기(create-sheet·
// add-players·records)는 서버가 403으로 막는다. 프론트는 role을 알 방법이 없어(GET /api/records
// 응답에 role 필드 없음) 이 구분을 게이트 단계에서 하지 않는다(docs/plans/issue-67-* §3).
import { Navigate, Outlet } from 'react-router-dom'
import { Spinner } from '../common/Spinner'
import { ErrorPanel } from '../common/ErrorPanel'
import { useRecords } from '../../hooks/useRecords'
import { UnauthorizedError } from '../../lib/api-error'

export function AdminGate() {
  const { isPending, error, refetch } = useRecords()

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <Spinner label="확인 중…" />
      </div>
    )
  }

  if (error instanceof UnauthorizedError) {
    return <Navigate to="/admin/login" replace />
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <ErrorPanel message={error.message} onRetry={() => refetch()} />
      </div>
    )
  }

  return <Outlet />
}
