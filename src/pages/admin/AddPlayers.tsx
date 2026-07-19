// 참가자 추가(#67) — docs/prd-design.html §05: 회차 칩 + 그 회차에 없는 활동 선수 멀티선택 +
// 하단 고정 확인 바 "N명 추가하기". 참가자 목록에서 진입 시 router state로 현재 회차를 넘겨받아
// 미리 선택해둔다(location.state?.sessionDate) — 없으면(시트 관리 홈에서 바로 진입) 최신 회차가
// 기본값이다.
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CenteredPanel } from '../../components/common/CenteredPanel'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'
import { FilterChip } from '../../components/FilterChip'
import { addPlayers } from '../../lib/add-players-api'
import { compareKorean } from '../../lib/korean-sort'
import { RECORDS_QUERY_KEY, useRecords } from '../../hooks/useRecords'

export default function AddPlayers() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { data, isError, error, refetch } = useRecords()

  const requestedSessionDate = (location.state as { sessionDate?: string } | null)?.sessionDate
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(requestedSessionDate ?? null)
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
        <Spinner label="회차 불러오는 중…" />
      </CenteredPanel>
    )
  }

  if (data.sessions.length === 0) {
    return (
      <CenteredPanel>
        <EmptyState title="아직 생성된 회차가 없습니다" description="먼저 기록지를 만들어야 참가자를 추가할 수 있어요">
          <button
            type="button"
            onClick={() => navigate('/admin/create-sheet')}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
          >
            기록지 만들기
          </button>
        </EmptyState>
      </CenteredPanel>
    )
  }

  const latestSessionDate = data.sessions[data.sessions.length - 1].date
  const sessionDate = selectedSessionDate ?? latestSessionDate
  const session = data.sessions.find((candidate) => candidate.date === sessionDate) ?? data.sessions[data.sessions.length - 1]

  const participantIds = new Set(session.entries.map((entry) => entry.playerId))
  const candidates = data.players
    .filter((player) => player.status === '활동' && !participantIds.has(player.id))
    .sort(compareKorean)

  function toggle(playerId: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  function selectSession(date: string) {
    setSelectedSessionDate(date)
    setSelected(new Set())
    setSubmitError(null)
  }

  async function handleConfirm() {
    setSubmitting(true)
    setSubmitError(null)

    const result = await addPlayers(session.date, [...selected])

    if (!result.ok) {
      setSubmitError(result.message)
      setSubmitting(false)
      return
    }

    await queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY, exact: true })
    navigate(`/admin/records/${result.sessionDate}`, {
      state: { toast: `✓ ${result.added.length}명 추가됨 · 참가자 목록에 반영` },
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 pb-28">
      <h1 className="text-xl font-bold tracking-tight text-ink">참가자 추가</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {data.sessions.map((candidate, index) => (
          <FilterChip key={candidate.date} active={candidate.date === session.date} onClick={() => selectSession(candidate.date)}>
            {index + 1}차
          </FilterChip>
        ))}
      </div>

      {candidates.length === 0 ? (
        <EmptyState title="추가할 선수가 없습니다" description="활동 중인 선수가 모두 이 회차에 참가 중이에요" />
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
          {submitting ? '추가하는 중…' : `${selected.size}명 추가하기`}
        </button>
      </div>
    </div>
  )
}
