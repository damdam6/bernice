import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { RecordsResponse } from '../../shared/domain'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorPanel } from '../components/common/ErrorPanel'
import { Spinner } from '../components/common/Spinner'
import { FilterChip } from '../components/FilterChip'
import { RankingRow } from '../components/RankingRow'
import { useRecords } from '../hooks/useRecords'
import { buildPerformanceScale } from '../lib/performance-scale'
import { buildEventGuidance, buildRankingRows, findTiedRanks } from '../lib/ranking-view'

function CenteredPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6">{children}</div>
}

export default function Rankings() {
  const { data, isError, error, refetch } = useRecords()

  if (isError) {
    return (
      <CenteredPanel>
        <ErrorPanel message={error?.message ?? '알 수 없는 오류가 발생했습니다'} onRetry={() => refetch()} />
      </CenteredPanel>
    )
  }

  // isError가 아니고 data가 아직 없으면 로딩 중 — isLoading 대신 data 자체로 좁혀
  // TanStack Query 판별 유니온에 기대지 않고도 타입을 안전하게 좁힌다.
  if (!data) {
    return (
      <CenteredPanel>
        <Spinner label="랭킹 불러오는 중…" />
      </CenteredPanel>
    )
  }

  if (data.events.length === 0 || data.sessions.length === 0) {
    return (
      <CenteredPanel>
        <EmptyState title="아직 기록된 회차가 없습니다" />
      </CenteredPanel>
    )
  }

  return <RankingsContent data={data} />
}

function RankingsContent({ data }: { data: RecordsResponse }) {
  const { events, sessions, rankings, players } = data
  const scale = useMemo(() => buildPerformanceScale(events, sessions), [events, sessions])

  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null)
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null)

  const event = events.find((e) => e.key === selectedEventKey) ?? events[0]
  const latestSessionDate = sessions[sessions.length - 1].date
  const sessionDate = selectedSessionDate ?? latestSessionDate

  const eventRanking = rankings.find((r) => r.sessionDate === sessionDate)?.events.find((er) => er.event === event.key)
  const session = sessions.find((s) => s.date === sessionDate)
  const rows = eventRanking && session ? buildRankingRows(eventRanking, session, event.key, players) : []
  const tiedRanks = findTiedRanks(rows)

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold tracking-tight text-ink">랭킹</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {events.map((e) => (
          <FilterChip key={e.key} active={e.key === event.key} onClick={() => setSelectedEventKey(e.key)}>
            {e.key}
          </FilterChip>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {sessions.map((s, i) => (
          <FilterChip key={s.date} active={s.date === sessionDate} onClick={() => setSelectedSessionDate(s.date)}>
            {i + 1}차
          </FilterChip>
        ))}
      </div>

      <p className="text-sm text-ink-sub">{buildEventGuidance(event)}</p>

      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <EmptyState title="표시할 기록이 없습니다" />
        ) : (
          rows.map((row) => <RankingRow key={row.playerId} row={row} event={event} scale={scale} tiedRanks={tiedRanks} />)
        )}
      </div>
    </div>
  )
}
