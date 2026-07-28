// 기록지 만들기(#67) — docs/prd-design.html §05: "오늘 · YYYY-MM-DD" + 참가자 선택 리스트
// (활동·가나다·기본 해제) + 하단 고정 확인 바 "N명으로 기록지 만들기"(0명이면 비활성).
//
// #155: 실패 사유는 하단 고정 바 내부에 렌더한다 — 참가자 리스트가 뷰포트보다 길면 일반
// 플로우의 문구는 스크롤 위치에 따라 화면 밖이라 "무반응"으로 보였다. 409 sheet_already_exists
// 는 막다른 길이 아니라 동선이다: 안내와 함께 그 날짜의 기록 입력으로 이동하는 CTA를 띄우되,
// 409가 난 상황은 records 캐시가 그 탭을 모르는 상태이므로(그래서 만들기를 시도했다) 강제
// 새로 고침(useRefreshRecords)이 성공한 뒤에만 이동한다 — 그냥 가면 RecordsParticipants의
// "회차를 찾을 수 없습니다"라는 2차 막다른 길에 착지한다. 캐시에 오늘 세션이 이미 보이면
// 사전 안내 배너를 띄우지만 플로우는 차단하지 않는다(스테일 가능성 — 진실은 서버 가드가 판정).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CenteredPanel } from '../../components/common/CenteredPanel'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'
import { SelectablePlayerList } from '../../components/SelectablePlayerList'
import { useRecords } from '../../hooks/useRecords'
import { useMultiSelect } from '../../hooks/useMultiSelect'
import { useRefreshRecords } from '../../hooks/useRefreshRecords'
import { useSubmitMutation } from '../../hooks/useSubmitMutation'
import { createSheet } from '../../lib/create-sheet-api'
import { compareKorean } from '../../lib/korean-sort'
import { formatSeoulDate } from '../../lib/seoul-date'

export default function CreateSheet() {
  const navigate = useNavigate()
  const { data, isError, error, refetch } = useRecords()
  const { selected, toggle } = useMultiSelect()
  const { submitting, submitError, submit } = useSubmitMutation()
  const { refreshing, refresh } = useRefreshRecords()
  const [conflictDate, setConflictDate] = useState<string | null>(null)
  const [conflictNavError, setConflictNavError] = useState<string | null>(null)

  if (isError) {
    return (
      <CenteredPanel>
        <ErrorPanel message={error?.message ?? '알 수 없는 오류가 발생했습니다'} onRetry={() => refetch()} />
      </CenteredPanel>
    )
  }

  if (!data) {
    return (
      <CenteredPanel>
        <Spinner label="참가자 불러오는 중…" />
      </CenteredPanel>
    )
  }

  const today = formatSeoulDate(new Date())
  const hasTodaySession = data.sessions.some((session) => session.date === today)

  const candidates = data.players
    .filter((player) => player.status === '활동')
    .sort(compareKorean)

  async function handleConfirm() {
    setConflictDate(null)
    setConflictNavError(null)
    await submit(
      async () => {
        const result = await createSheet([...selected])
        // 409는 훅 계약(message만 노출) 밖의 분기 정보가 필요하다 — thunk에서 결과를 관찰해
        // 로컬 상태로 남긴다. 훅 계약을 바꾸지 않으면서 이 화면만 동선을 얻는 최소 지점.
        if (!result.ok && result.error === 'sheet_already_exists') {
          setConflictDate(result.sessionDate ?? formatSeoulDate(new Date()))
        }
        return result
      },
      (result) => {
        navigate(`/admin/records/${result.sessionDate}`, {
          state: { toast: `✓ ${result.sessionDate} 기록지 생성됨 · 팀원 열람에 반영` },
        })
      },
    )
  }

  async function goToConflictRecords(date: string) {
    setConflictNavError(null)
    const result = await refresh()
    if (result.ok) navigate(`/admin/records/${date}`)
    else setConflictNavError(result.message)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">기록지 만들기</h1>
        <p className="mt-1 text-sm text-ink-sub">오늘 · {today} (Asia/Seoul)</p>
      </div>

      {hasTodaySession && (
        <div className="rounded-card border border-line bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-ink">오늘({today}) 기록지가 이미 있어요</p>
          <p className="mt-1 text-sm text-ink-sub">기록 입력에서 이어서 입력할 수 있어요.</p>
          <button
            type="button"
            onClick={() => navigate(`/admin/records/${today}`)}
            className="mt-3 w-full rounded-[13px] border border-line bg-white py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
          >
            기록 입력으로 이동
          </button>
        </div>
      )}

      {candidates.length === 0 ? (
        <EmptyState title="활동 중인 선수가 없습니다" description="명단에서 선수 상태를 먼저 확인해주세요" />
      ) : (
        <SelectablePlayerList players={candidates} selected={selected} onToggle={toggle} />
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-canvas via-canvas px-4 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {conflictDate ? (
          <>
            <p role="alert" className="mb-3 text-center text-sm text-bad">
              오늘({conflictDate}) 기록지가 이미 있어요 — 기록 입력에서 이어서 입력하세요
            </p>
            {conflictNavError && (
              <p role="alert" className="mb-3 text-center text-sm text-bad">
                {conflictNavError}
              </p>
            )}
            <button
              type="button"
              disabled={refreshing}
              onClick={() => goToConflictRecords(conflictDate)}
              className="w-full rounded-[13px] bg-primary py-3.5 text-sm font-bold text-white transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-neutral-strong disabled:opacity-60"
            >
              {refreshing ? '최신 데이터 불러오는 중…' : '기록 입력으로 이동'}
            </button>
          </>
        ) : (
          <>
            {submitError && (
              <p role="alert" className="mb-3 text-center text-sm text-bad">
                {submitError}
              </p>
            )}
            <button
              type="button"
              disabled={selected.size === 0 || submitting}
              onClick={handleConfirm}
              className="w-full rounded-[13px] bg-primary py-3.5 text-sm font-bold text-white transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-neutral-strong disabled:opacity-60"
            >
              {submitting ? '만드는 중…' : `${selected.size}명으로 기록지 만들기`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
