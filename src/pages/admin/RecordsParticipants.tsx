// 기록 입력 · 참가자 목록(#67) — docs/prd-design.html §05 · docs/prd-record-input.html §05:
// 그 회차 참가자를 가나다 정렬로, 선수마다 입력 상태 뱃지(미입력/일부/완료) + [참가자 추가] 진입점.
//
// 이 화면은 기록지 만들기·참가자 추가 성공 시의 공통 착지점이기도 하다 — 두 화면이
// navigate(..., {state:{toast}})로 넘긴 메시지를 여기서 한 번 보여준다. 저장(#68)의
// "참가자 목록 복귀 + 토스트" 계약과 같은 메커니즘을 미리 갖춰두는 것이다.
import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { RecordsResponse, Session } from '../../../shared/domain'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'
import { Toast } from '../../components/common/Toast'
import { EntryStatusPill } from '../../components/EntryStatusPill'
import { useToast } from '../../hooks/useToast'
import { useRecords } from '../../hooks/useRecords'
import { deriveEntryStatus } from '../../lib/entry-status'
import { compareKorean } from '../../lib/korean-sort'

function CenteredPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6">{children}</div>
}

export default function RecordsParticipants() {
  const { sessionDate } = useParams<{ sessionDate: string }>()
  const navigate = useNavigate()
  const { data, isError, error, refetch } = useRecords()

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

  const session = data.sessions.find((candidate) => candidate.date === sessionDate)
  if (!session) {
    return (
      <CenteredPanel>
        <EmptyState title="회차를 찾을 수 없습니다" description={`${sessionDate} 회차 탭이 없어요`} />
      </CenteredPanel>
    )
  }

  return (
    <ParticipantsContent
      data={data}
      session={session}
      onSelectPlayer={(playerId) => navigate(`/admin/records/${session.date}/${playerId}`)}
      onAddPlayers={() => navigate('/admin/add-players', { state: { sessionDate: session.date } })}
    />
  )
}

function ParticipantsContent({
  data,
  session,
  onSelectPlayer,
  onAddPlayers,
}: {
  data: RecordsResponse
  session: Session
  onSelectPlayer: (playerId: number) => void
  onAddPlayers: () => void
}) {
  const location = useLocation()
  const { message, show } = useToast()

  useEffect(() => {
    const state = location.state as { toast?: string } | null
    if (state?.toast) show(state.toast)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입 시 1회만: location.state는 이 마운트의 히스토리 엔트리에 고정된 값.
  }, [])

  const roundLabel = data.sessions.findIndex((candidate) => candidate.date === session.date) + 1
  const rows = [...session.entries].sort((a, b) =>
    compareKorean({ id: a.playerId, name: a.name }, { id: b.playerId, name: b.name }),
  )

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6">
      <Toast message={message} />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">참가자 목록</h1>
        <p className="mt-1 text-sm text-ink-sub">
          {roundLabel}차 · {session.date}
        </p>
      </div>

      <button
        type="button"
        onClick={onAddPlayers}
        className="w-full rounded-[13px] border border-line bg-white py-3 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
      >
        참가자 추가
      </button>

      {rows.length === 0 ? (
        <EmptyState title="참가자가 없습니다" description="[참가자 추가]로 이 회차에 선수를 등록해보세요" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((entry) => (
            <button
              key={entry.playerId}
              type="button"
              onClick={() => onSelectPlayer(entry.playerId)}
              className="flex w-full items-center justify-between rounded-card border border-line bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-primary"
            >
              <span className="text-sm font-bold text-ink">{entry.name}</span>
              <EntryStatusPill status={deriveEntryStatus(entry, data.events)} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
