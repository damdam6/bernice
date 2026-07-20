import { useMemo, useState } from 'react'
import type { RecordsResponse } from '../../shared/domain'
import { Card } from '../components/Card'
import { FilterChip } from '../components/FilterChip'
import { GrowthStatCard } from '../components/GrowthStatCard'
import { PlayerSelect } from '../components/PlayerSelect'
import { RadarChart, TrendChart } from '../components/charts'
import { CenteredPanel } from '../components/common/CenteredPanel'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorPanel } from '../components/common/ErrorPanel'
import { Spinner } from '../components/common/Spinner'
import { useRecords } from '../hooks/useRecords'
import { buildPerformanceScale } from '../lib/performance-scale'
import { buildGrowthCards, buildRadarAxes, buildSessionLabels, buildTrendSeries } from '../lib/profile-view'

export default function Players() {
  const { data, isError, error, refetch } = useRecords()

  if (isError) {
    return (
      <CenteredPanel>
        <ErrorPanel message={error?.message ?? '알 수 없는 오류가 발생했습니다'} onRetry={() => refetch()} />
      </CenteredPanel>
    )
  }

  // Rankings.tsx와 동일 — isLoading 대신 data 자체로 좁혀 판별 유니온에 기대지 않는다.
  if (!data) {
    return (
      <CenteredPanel>
        <Spinner label="프로필 불러오는 중…" />
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

  if (data.players.length === 0) {
    return (
      <CenteredPanel>
        <EmptyState title="표시할 선수가 없습니다" />
      </CenteredPanel>
    )
  }

  return <ProfileContent data={data} />
}

function ProfileContent({ data }: { data: RecordsResponse }) {
  const { events, sessions, players } = data
  // 랭킹·레이더·추이가 같은 인스턴스를 공유해 정규화 값이 정의상 일치한다(§07).
  const scale = useMemo(() => buildPerformanceScale(events, sessions), [events, sessions])
  const sessionLabels = useMemo(() => buildSessionLabels(sessions), [sessions])

  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(players[0].id)
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null)
  // 기본으로 첫 종목 카드를 확장해 추이 차트를 바로 보여준다(목업 기본 동작). null이면 전부 접힘.
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(events[0].key)

  const player = players.find((p) => p.id === selectedPlayerId) ?? players[0]
  const latestSessionDate = sessions[sessions.length - 1].date
  const sessionDate = selectedSessionDate ?? latestSessionDate
  const session = sessions.find((s) => s.date === sessionDate)

  const radarAxes = buildRadarAxes(events, session, player.id, scale)
  const growthCards = buildGrowthCards(events, session, player)
  const cardByEvent = new Map(growthCards.map((card) => [card.eventKey, card]))

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">개인 프로필</h1>
        <p className="mt-1 text-sm text-ink-sub">선수별 스킬 프로필 · 종목별 성장 추이</p>
      </header>

      <PlayerSelect players={players} selectedId={player.id} onSelect={setSelectedPlayerId} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {sessions.map((s, i) => (
          <FilterChip key={s.date} active={s.date === sessionDate} onClick={() => setSelectedSessionDate(s.date)}>
            {i + 1}차
          </FilterChip>
        ))}
      </div>

      <Card className="flex justify-center">
        <RadarChart axes={radarAxes} />
      </Card>

      <div className="mt-1 flex items-center justify-between px-0.5">
        <h2 className="text-sm font-bold text-ink">종목별 성장</h2>
        <span className="text-xs text-ink-sub">PB : Personal Best</span>
      </div>

      <div className="flex flex-col gap-2">
        {events.map((event) => {
          const card = cardByEvent.get(event.key)
          if (!card) return null
          const expanded = event.key === selectedEventKey
          const series = expanded ? buildTrendSeries(event, sessions, players, player.id, scale) : null
          return (
            <GrowthStatCard
              key={event.key}
              card={card}
              expanded={expanded}
              onToggle={() => setSelectedEventKey((prev) => (prev === event.key ? null : event.key))}
            >
              {series && (
                <TrendChart
                  sessionLabels={sessionLabels}
                  highlight={series.highlight}
                  background={series.background}
                  goal={series.goal}
                  label={`${event.key} 추이`}
                />
              )}
            </GrowthStatCard>
          )
        })}
      </div>
    </div>
  )
}
