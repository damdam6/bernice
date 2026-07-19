// 기록지 만들기(#67) — docs/prd-design.html §05: "오늘 · YYYY-MM-DD" + 참가자 선택 리스트
// (활동·가나다·기본 해제) + 하단 고정 확인 바 "N명으로 기록지 만들기"(0명이면 비활성).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CenteredPanel } from '../../components/common/CenteredPanel'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'
import { RECORDS_QUERY_KEY, useRecords } from '../../hooks/useRecords'
import { createSheet } from '../../lib/create-sheet-api'
import { compareKorean } from '../../lib/korean-sort'
import { formatSeoulDate } from '../../lib/seoul-date'

export default function CreateSheet() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isError, error, refetch } = useRecords()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  function toggle(playerId: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  async function handleConfirm() {
    setSubmitting(true)
    setSubmitError(null)

    const result = await createSheet([...selected])

    if (!result.ok) {
      setSubmitError(result.message)
      setSubmitting(false)
      return
    }

    await queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY, exact: true })
    navigate(`/admin/records/${result.sessionDate}`, {
      state: { toast: `✓ ${result.sessionDate} 기록지 생성됨 · 팀원 열람에 반영` },
    })
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
        <div className="flex flex-col gap-2">
          {candidates.map((player) => {
            const isSelected = selected.has(player.id)
            return (
              <button
                key={player.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(player.id)}
                className={`flex w-full items-center justify-between rounded-card border px-5 py-4 text-left transition-colors ${
                  isSelected ? 'border-primary bg-primary-tint' : 'border-line bg-white'
                }`}
              >
                <span className="text-sm font-bold text-ink">{player.name}</span>
                <span
                  className={`flex size-5 items-center justify-center rounded-md text-xs font-bold text-white ${
                    isSelected ? 'bg-primary' : 'border border-input-line bg-transparent'
                  }`}
                >
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>
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
