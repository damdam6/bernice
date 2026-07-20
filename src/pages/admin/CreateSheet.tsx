// 기록지 만들기(#67) — docs/prd-design.html §05: "오늘 · YYYY-MM-DD" + 참가자 선택 리스트
// (활동·가나다·기본 해제) + 하단 고정 확인 바 "N명으로 기록지 만들기"(0명이면 비활성).
import { useNavigate } from 'react-router-dom'
import { CenteredPanel } from '../../components/common/CenteredPanel'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'
import { SelectablePlayerList } from '../../components/SelectablePlayerList'
import { useRecords } from '../../hooks/useRecords'
import { useMultiSelect } from '../../hooks/useMultiSelect'
import { useSubmitMutation } from '../../hooks/useSubmitMutation'
import { createSheet } from '../../lib/create-sheet-api'
import { compareKorean } from '../../lib/korean-sort'
import { formatSeoulDate } from '../../lib/seoul-date'

export default function CreateSheet() {
  const navigate = useNavigate()
  const { data, isError, error, refetch } = useRecords()
  const { selected, toggle } = useMultiSelect()
  const { submitting, submitError, submit } = useSubmitMutation()

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

  const candidates = data.players
    .filter((player) => player.status === '활동')
    .sort(compareKorean)

  async function handleConfirm() {
    await submit(
      () => createSheet([...selected]),
      (result) => {
        navigate(`/admin/records/${result.sessionDate}`, {
          state: { toast: `✓ ${result.sessionDate} 기록지 생성됨 · 팀원 열람에 반영` },
        })
      },
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">기록지 만들기</h1>
        <p className="mt-1 text-sm text-ink-sub">오늘 · {formatSeoulDate(new Date())} (Asia/Seoul)</p>
      </div>

      {candidates.length === 0 ? (
        <EmptyState title="활동 중인 선수가 없습니다" description="명단에서 선수 상태를 먼저 확인해주세요" />
      ) : (
        <SelectablePlayerList players={candidates} selected={selected} onToggle={toggle} />
      )}

      {submitError && (
        <p role="alert" className="text-center text-sm text-bad">
          {submitError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-canvas via-canvas px-4 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={selected.size === 0 || submitting}
          onClick={handleConfirm}
          className="w-full rounded-[13px] bg-primary py-3.5 text-sm font-bold text-white transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-neutral-strong disabled:opacity-60"
        >
          {submitting ? '만드는 중…' : `${selected.size}명으로 기록지 만들기`}
        </button>
      </div>
    </div>
  )
}
