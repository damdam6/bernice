// 시트 관리 홈(#67) — docs/prd-design.html §05: 버튼 3개 세로 스택(기록 입력 강조·참가자
// 추가·기록지 만들기) + 로그아웃 텍스트 버튼 + 안내 박스.
// #151: 시트를 직접 편집했을 때의 탈출구로 "데이터 새로 고침" 버튼 추가 — 엣지·브라우저
// 캐시를 모두 뚫고 최신 데이터를 반영한다(흐름은 useRefreshRecords 참고).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/Card'
import { Toast } from '../../components/common/Toast'
import { RECORDS_QUERY_KEY } from '../../hooks/useRecords'
import { useRefreshRecords } from '../../hooks/useRefreshRecords'
import { useToast } from '../../hooks/useToast'
import { logout } from '../../lib/logout-api'

export default function SheetManagementHome() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [loggingOut, setLoggingOut] = useState(false)
  const { refreshing, refresh } = useRefreshRecords()
  const { message: toastMessage, show: showToast } = useToast()
  const [refreshError, setRefreshError] = useState<string | null>(null)

  async function handleRefresh() {
    setRefreshError(null)
    const result = await refresh()
    if (result.ok) showToast('최신 데이터를 불러왔어요')
    else setRefreshError(result.message)
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // 네트워크 오류여도 로그아웃 의도는 유지한다 — 다음 로그인이 세션 쿠키를 어차피 덮어쓴다.
    } finally {
      await queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY, exact: true })
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-10">
      <div className="flex w-full max-w-frame flex-col gap-6">
        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">시트 관리</h1>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/records')}
            className="w-full rounded-[13px] bg-primary py-3.5 text-sm font-bold text-white transition-colors hover:bg-primary-strong"
          >
            기록 입력
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/add-players')}
            className="w-full rounded-[13px] border border-line bg-white py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
          >
            참가자 추가
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/create-sheet')}
            className="w-full rounded-[13px] border border-line bg-white py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
          >
            기록지 만들기
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full rounded-[13px] border border-line bg-white py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? '새로 고침 중…' : '데이터 새로 고침'}
          </button>
        </div>

        {refreshError && (
          <p role="alert" className="text-center text-sm text-bad">
            {refreshError}
          </p>
        )}

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-sm font-semibold text-ink-sub transition-colors hover:text-ink disabled:opacity-50"
        >
          로그아웃
        </button>

        <Card>
          <p className="text-sm text-ink-sub">
            시트가 SoT예요 — 저장하면 검증된 값만 들어가고, 팀원 열람에 즉시 반영돼요.
          </p>
        </Card>
      </div>

      <Toast message={toastMessage} />
    </div>
  )
}
