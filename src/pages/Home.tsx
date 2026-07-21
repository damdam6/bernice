import { Lock, TrendingUp, Trophy } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import type { RecordsResponse } from '../../shared/domain'
import { AchievementGauge } from '../components/charts'
import { CenteredPanel } from '../components/common/CenteredPanel'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorPanel } from '../components/common/ErrorPanel'
import { Spinner } from '../components/common/Spinner'
import { useRecords } from '../hooks/useRecords'
import { averageAchievementPct, buildHomeGauges, latestSessionOrdinal, type HomeGauge } from '../lib/home-summary'

// 홈(#103) — LoginGate가 이미 캐시에 채운 useRecords() 실데이터로 요약을 조립한다.
// 로딩/에러 분기는 Rankings와 동일 패턴(사실상 LoginGate가 먼저 걸러 방어 코드).
// 레이아웃·색·수치 정본: docs/prd-design.html §05~§07 + DesignSync 목업 HOME 섹션.
export default function Home() {
  const { data, isError, error, refetch } = useRecords()

  if (isError) {
    return (
      <CenteredPanel>
        <ErrorPanel message={error?.message ?? '알 수 없는 오류가 발생했습니다'} onRetry={() => refetch()} />
      </CenteredPanel>
    )
  }

  // isError가 아니고 data가 아직 없으면 로딩 중 — Rankings와 같이 data 자체로 좁힌다.
  if (!data) {
    return (
      <CenteredPanel>
        <Spinner label="홈 불러오는 중…" />
      </CenteredPanel>
    )
  }

  return <HomeContent data={data} />
}

function HomeContent({ data }: { data: RecordsResponse }) {
  const { home, sessions, events } = data
  const { latestSession, achievementRates } = home

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 pt-4">
      <Header />

      {latestSession === null ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="아직 기록된 회차가 없습니다" />
        </div>
      ) : (
        <>
          <LatestSessionCard
            ordinal={latestSessionOrdinal(sessions, latestSession.date)}
            date={latestSession.date}
            participantCount={latestSession.participantCount}
            averagePct={averageAchievementPct(achievementRates)}
          />

          {achievementRates.length > 0 && <GaugeList gauges={buildHomeGauges(achievementRates, events)} />}

          <Shortcuts />
        </>
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="mb-6 flex items-center justify-between">
      <span className="text-[30px] font-extrabold uppercase leading-none tracking-[0.03em] text-primary">BERNICE</span>
      <Link
        to="/admin/login"
        aria-label="관리자 로그인"
        className="flex size-10 items-center justify-center rounded-xl border border-input-line bg-white text-chip-ink transition-colors hover:border-primary hover:text-primary"
      >
        <Lock className="size-5" />
      </Link>
    </header>
  )
}

interface LatestSessionCardProps {
  ordinal: number
  date: string
  participantCount: number
  averagePct: number
}

function LatestSessionCard({ ordinal, date, participantCount, averagePct }: LatestSessionCardProps) {
  return (
    <div className="overflow-hidden rounded-[20px] bg-primary px-[22px] py-5 text-white">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold tracking-[0.02em] text-primary-soft">최신 회차 · {ordinal}차</span>
        <span className="text-xl font-extrabold tracking-[-0.01em]">{date}</span>
      </div>
      <div className="mt-5 flex justify-end gap-7 text-right">
        <Stat value={participantCount} unit="명" label="참여 인원" />
        <Stat value={averagePct} unit="%" label="평균 목표 달성" />
      </div>
    </div>
  )
}

function Stat({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <div>
      <div className="text-[22px] font-extrabold">
        {value}
        <span className="text-[13px] font-semibold text-primary-soft">{unit}</span>
      </div>
      {/* 인디고 카드 위 소형 라벨 — #9fa8da는 토큰 미존재(primary-soft보다 한 단계 흐림)라 인라인 임의값 */}
      <div className="mt-px text-[11px] text-[#9fa8da]">{label}</div>
    </div>
  )
}

function GaugeList({ gauges }: { gauges: HomeGauge[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 px-0.5 text-sm font-bold text-ink">종목별 팀 목표 달성률</h2>
      <div className="flex flex-col gap-2.5">
        {gauges.map((gauge) => (
          <div key={gauge.event} className="rounded-2xl border border-line bg-white px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{gauge.label}</span>
              <span className="text-xs text-ink-sub">
                {gauge.achievedCount}/{gauge.eligibleCount}명 달성
              </span>
            </div>
            <AchievementGauge value={gauge.rate} />
          </div>
        ))}
      </div>
    </section>
  )
}

function Shortcuts() {
  return (
    <section className="mt-6">
      <h2 className="mb-3 px-0.5 text-sm font-bold text-ink">바로가기</h2>
      <div className="grid grid-cols-2 gap-2.5">
        <ShortcutCard to="/rankings" Icon={Trophy} title="랭킹" subtitle="누가 제일 잘해?" />
        <ShortcutCard to="/players" Icon={TrendingUp} title="개인 추이" subtitle="종목별 성장 그래프" />
      </div>
    </section>
  )
}

interface ShortcutCardProps {
  to: string
  Icon: ComponentType<{ className?: string }>
  title: string
  subtitle: string
}

function ShortcutCard({ to, Icon, title, subtitle }: ShortcutCardProps) {
  return (
    <Link to={to} className="rounded-2xl border border-line bg-white p-4 transition-colors hover:border-primary">
      <Icon className="size-6 text-primary" />
      <div className="mt-2 text-sm font-bold text-ink">{title}</div>
      <div className="mt-px text-[11px] text-neutral-strong">{subtitle}</div>
    </Link>
  )
}
