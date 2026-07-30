// 개인 프로필 화면 파생 로직 — 디자인 PRD §05 "👤 개인" 매핑 표의 구현.
// Rankings가 ranking-view.ts에 파생을 두는 것과 같은 분리: 화면(Players.tsx)은 배선만,
// 값 계산은 여기 순수 함수가 담당해 DOM 없이 단위 테스트한다.
//
// 레이더는 랭킹과 동일한 buildPerformanceScale(events, sessions) 인스턴스를 주입받아 정규화한다(§07) —
// 레이더·랭킹 미니바의 값이 정의상 일치한다. 추이 차트는 원값 축이라 scale을 쓰지 않는다(#172).
// 델타는 계약값(trends[].points[].deltaFromPrevious/
// improved, "직전 유효 기록 대비")을 그대로 신뢰한다(§05 · §01 콜아웃) — 화면에서 재계산하지 않는다.
import type {
  EventDefinition,
  EventScore,
  EventValueKind,
  PlayerEventTrend,
  PlayerSummary,
  Session,
} from '../../shared/domain'
import type { RadarAxis, TrendPointDatum } from '../components/charts'
import type { PerformanceScale } from './performance-scale'

/** 회차 라벨 — 날짜 오름차순 index+1 ("1차", …). Rankings.tsx의 {i+1}차와 동일 규칙. */
export function buildSessionLabels(sessions: Session[]): string[] {
  return sessions.map((_, i) => `${i + 1}차`)
}

/** 선택 회차의 측정 종목(session.eventKeys) 정규화 성능 레이더 축 — 회차마다 축 개수가
 *  가변(4각형↔7각형 등, PRD §08). compute-rankings.ts의 eventKeys 기준 순회와 동형 패턴.
 *  recorded면 정규화, 그 외(면제·미측정·이상값·미참여)는 0으로 둔다. 라벨은 종목 key가 곧 short 라벨. */
export function buildRadarAxes(
  events: EventDefinition[],
  session: Session | undefined,
  playerId: number,
  scale: PerformanceScale,
): RadarAxis[] {
  const eventsByKey = new Map(events.map((event) => [event.key, event]))
  const entry = session?.entries.find((e) => e.playerId === playerId)
  return (session?.eventKeys ?? [])
    .map((key) => eventsByKey.get(key))
    .filter((event): event is EventDefinition => event !== undefined)
    .map((event) => {
      const score = entry?.scores[event.key]
      const value = score?.status === 'recorded' ? scale.normalize(event.key, score.value) : 0
      return { label: event.key, value }
    })
}

/** 델타 색상 톤 — 개선(up)=green, 악화(down)=red, 첫 기록·미기록·동률(muted)=회색. */
export type DeltaTone = 'up' | 'down' | 'muted'

export interface GrowthDelta {
  text: string
  tone: DeltaTone
}

export interface GrowthCardDatum {
  eventKey: string
  label: string
  /** 종료 종목 여부(event.endSessionDate !== null) — 카드 뱃지 렌더는 #125 스코프 */
  ended: boolean
  /** PB 표시값 — 스파스(유효 기록 없는 종목은 '—') */
  pb: string
  /** 선택 회차 현재값 — recorded면 display, 면제면 '면제', 그 외 '—' */
  value: string
  delta: GrowthDelta
}

const MUTED_DELTA: GrowthDelta = { text: '—', tone: 'muted' }

function currentValueText(score: EventScore | undefined): string {
  if (!score) return '—'
  if (score.status === 'recorded') return score.display
  if (score.status === 'exempt') return '면제'
  return '—' // unmeasured · invalid
}

// 델타 표기 — 계약의 deltaFromPrevious/improved만 읽는다. null(첫 기록/미기록) → '—',
// 0(동률) → '─ 0', 그 외 → ▲/▼ + |Δ|(시간 종목은 "초" 접미). improved가 방향(낮을수록 포함)을
// 이미 반영하므로 부호가 아니라 improved로 색·화살표를 정한다.
function buildDelta(
  trend: PlayerEventTrend | undefined,
  sessionDate: string | undefined,
  valueKind: EventValueKind,
): GrowthDelta {
  const point = trend?.points.find((p) => p.sessionDate === sessionDate)
  if (!point || point.deltaFromPrevious === null) return MUTED_DELTA
  if (point.deltaFromPrevious === 0) return { text: '─ 0', tone: 'muted' }
  const unit = valueKind === 'time' ? '초' : ''
  return {
    text: `${point.improved ? '▲' : '▼'} ${Math.abs(point.deltaFromPrevious)}${unit}`,
    tone: point.improved ? 'up' : 'down',
  }
}

/** 종목별 성장 카드 목록 — 종목 순서(events[]) 그대로. 현역 종목은 전부, 종료 종목은 그 선수
 *  유효 기록이 1건 이상(personalBests에 항목 존재 — 이미 스파스 필터링됨)일 때만 포함한다(PRD §08).
 *  PB·현재값·직전 유효 기록 대비 델타. */
export function buildGrowthCards(
  events: EventDefinition[],
  session: Session | undefined,
  player: PlayerSummary,
): GrowthCardDatum[] {
  const entry = session?.entries.find((e) => e.playerId === player.id)
  const pbByEvent = new Map(player.personalBests.map((pb) => [pb.event, pb]))
  const trendByEvent = new Map(player.trends.map((t) => [t.event, t]))
  return events
    .filter((event) => event.endSessionDate === null || pbByEvent.has(event.key))
    .map((event) => ({
      eventKey: event.key,
      label: event.key,
      ended: event.endSessionDate !== null,
      pb: pbByEvent.get(event.key)?.display ?? '—',
      value: currentValueText(entry?.scores[event.key]),
      delta: buildDelta(trendByEvent.get(event.key), session?.date, event.valueKind),
    }))
}

export interface TrendSeries {
  /** 본인 라인 — 유효 기록 회차만(희소). value는 종목 원값 */
  highlight: TrendPointDatum[]
  /** 본인 제외 전체 선수 배경 라인들 — 빈 시리즈는 제외 */
  background: TrendPointDatum[][]
  /** 목표선 원값 — EventDefinition.targetValue 그대로 */
  goal: number
}

/** 한 종목의 확장 추이 차트 데이터 — 본인 하이라이트 + 전체 배경 + 목표선(§07).
 *  각 trends[].points[]의 sessionDate를 회차 인덱스로 매핑하고, y값은 원값을 그대로 넘긴다(#172) —
 *  추이 차트는 정규화 성능을 쓰지 않으므로 scale이 필요 없고, 축 범위 계산은 차트(trendDomain) 책임이다. */
export function buildTrendSeries(
  event: EventDefinition,
  sessions: Session[],
  players: PlayerSummary[],
  currentPlayerId: number,
): TrendSeries {
  const indexByDate = new Map(sessions.map((s, i) => [s.date, i]))
  const seriesFor = (trend: PlayerEventTrend | undefined): TrendPointDatum[] =>
    (trend?.points ?? [])
      .map((point) => ({
        sessionIndex: indexByDate.get(point.sessionDate) ?? -1,
        value: point.value,
      }))
      .filter((datum) => datum.sessionIndex >= 0)

  const trendOf = (player: PlayerSummary) => player.trends.find((t) => t.event === event.key)

  const current = players.find((p) => p.id === currentPlayerId)
  const highlight = current ? seriesFor(trendOf(current)) : []
  const background = players
    .filter((p) => p.id !== currentPlayerId)
    .map((p) => seriesFor(trendOf(p)))
    .filter((series) => series.length > 0)

  return { highlight, background, goal: event.targetValue }
}
