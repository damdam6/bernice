import { Link } from 'react-router-dom'
import { allEventTags, filterEventsByTag } from '../../shared/event-tags'
import { eventLabel } from '../../shared/event-identity'
import { useMemo, useState } from 'react'
import type { RecordsResponse } from '../../shared/domain'
import { CenteredPanel } from '../components/common/CenteredPanel'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorPanel } from '../components/common/ErrorPanel'
import { Spinner } from '../components/common/Spinner'
import { FilterChip } from '../components/FilterChip'
import { RankingRow } from '../components/RankingRow'
import { useRecords } from '../hooks/useRecords'
import { buildPerformanceScale } from '../lib/performance-scale'
import { buildEventGuidance, buildRankingRows, deriveSessionEvents, findTiedRanks } from '../lib/ranking-view'

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

  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null)
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null)

  const latestSessionDate = sessions[sessions.length - 1].date
  const sessionDate = selectedSessionDate ?? latestSessionDate
  const session = sessions.find((s) => s.date === sessionDate)

  // 종목 칩 = 선택 회차의 측정 종목만(eventIds 순서) — 회차 전환으로 선택 종목이 사라지면
  // 아래 find/??가 렌더마다 다시 평가되어 첫 종목으로 자동 폴백한다(#123)
  const sessionEvents = filterEventsByTag(session ? deriveSessionEvents(events, session) : [], selectedTag)
  // sessionEvents가 비면(계약상 발생 불가하나 잘못된 데이터 방어) event는 undefined —
  // 아래 렌더는 이 경우를 "표시할 기록이 없습니다"로 안전하게 수렴시킨다.
  const event: (typeof sessionEvents)[number] | undefined = sessionEvents.find((e) => e.id === selectedEventKey) ?? sessionEvents[0]

  const eventRanking = event && rankings.find((r) => r.sessionDate === sessionDate)?.events.find((er) => er.event === event.id)
  const rows = eventRanking && session && event ? buildRankingRows(eventRanking, session, event.id, players) : []
  const tiedRanks = findTiedRanks(rows)

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold tracking-tight text-ink">랭킹</h1>
      <Link to="/events" className="text-sm text-primary">태그별 전체 종목 보기</Link>
      <label className="text-sm">태그 필터
        <select aria-label="태그 필터" value={selectedTag === null ? 'all' : `tag:${selectedTag}`} onChange={(e) => setSelectedTag(e.target.value === 'all' ? null : e.target.value.slice(4))} className="ml-2 rounded-lg border border-line bg-white p-2">
          <option value="all">전체</option><option value="tag:">태그 없음</option>
          {allEventTags(events).map((tag) => <option key={tag} value={`tag:${tag}`}>{tag}</option>)}
        </select>
      </label>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {sessionEvents.map((e) => (
          <FilterChip key={e.id} active={e.id === event?.id} onClick={() => setSelectedEventKey(e.id)}>
            {eventLabel(e, events, sessions)}
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

      {event && <p className="text-sm text-ink-sub">{buildEventGuidance(event)}</p>}

      <div className="flex flex-col gap-2">
        {!event || rows.length === 0 ? (
          <EmptyState title="표시할 기록이 없습니다" />
        ) : (
          rows.map((row) => <RankingRow key={row.playerId} row={row} event={event} scale={scale} tiedRanks={tiedRanks} />)
        )}
      </div>
    </div>
  )
}
