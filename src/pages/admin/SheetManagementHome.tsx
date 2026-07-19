// 시트 관리 홈(#67) — docs/prd-design.html §05: 버튼 3개 세로 스택(기록 입력 강조·참가자
// 추가·기록지 만들기) + 로그아웃 텍스트 버튼 + 안내 박스.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/Card'
import { RECORDS_QUERY_KEY } from '../../hooks/useRecords'
import { logout } from '../../lib/logout-api'

export default function SheetManagementHome() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [loggingOut, setLoggingOut] = useState(false)

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
      <div className="flex w-full max-w-md flex-col gap-6">
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
        </div>

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
    </div>
  )
}
