// GET /api/records 응답 런타임 검증(#93) — `as RecordsResponse` 단언 대신 unknown에서 값을
// 꺼내 새 객체를 조립한다("parse, don't validate", functions/api/admin/records.ts parseBody와
// 같은 관용구). 조립형이라 shared/domain.ts에 필수 필드가 추가되면 여기가 컴파일 에러로 함께
// 강제된다. 검증 실패는 null — 에러 타입 정책(ApiError)은 호출부(useRecords)가 소유한다.
//
// 서버(build-records-response.ts)가 같은 domain.ts로 타입되어 있어 정상 배포에선 항상 통과한다.
// 이 파서가 막는 것은 배포 스큐·프록시 오염처럼 계약 밖 페이로드가 화면 깊숙이 흘러드는 경우다.
import { isPlainObject } from '../../shared/is-plain-object'
import {
  EVENT_VALUE_KINDS,
  RANK_DIRECTIONS,
  type EventAchievementRate,
  type EventDefinition,
  type EventRanking,
  type EventScore,
  type HomeSummary,
  type PlayerEventTrend,
  type PlayerPersonalBest,
  type PlayerStatus,
  type PlayerSummary,
  type RankingEntry,
  type RecordsResponse,
  type Session,
  type SessionEntry,
  type SessionRankings,
  type TrendPoint,
} from '../../shared/domain'

// PlayerSummary.status의 Exclude<PlayerStatus, '탈퇴'>를 값 수준으로 미러링 — satisfies로
// domain.ts의 상태 목록이 바뀌면 컴파일 에러로 어긋남이 드러난다.
const SUMMARY_STATUSES = ['활동', '비대상', '휴식'] as const satisfies readonly Exclude<
  PlayerStatus,
  '탈퇴'
>[]

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  const widened: readonly string[] = options
  return typeof value === 'string' && widened.includes(value)
}

// 원소 하나라도 계약 위반이면 배열 전체를 거부한다 — 부분 성공을 조용히 흘리면
// "events[] 전체 key가 scores에 항상 존재"(domain.ts SessionEntry) 같은 완전성 전제가 깨진다.
function parseArray<T>(raw: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null
  // Array.isArray는 any[]로 좁히므로 unknown[]으로 되넓혀 원소 접근을 검증 없이는 못 하게 한다.
  const list: unknown[] = raw
  const items: T[] = []
  for (const item of list) {
    const parsed = parseItem(item)
    if (parsed === null) return null
    items.push(parsed)
  }
  return items
}

function parseEventDefinition(raw: unknown): EventDefinition | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.key !== 'string') return null
  if (!isOneOf(raw.valueKind, EVENT_VALUE_KINDS)) return null
  if (typeof raw.target !== 'string') return null
  if (typeof raw.targetValue !== 'number') return null
  if (typeof raw.maxScore !== 'number' && raw.maxScore !== null) return null
  if (!isOneOf(raw.direction, RANK_DIRECTIONS)) return null
  return {
    key: raw.key,
    valueKind: raw.valueKind,
    target: raw.target,
    targetValue: raw.targetValue,
    maxScore: raw.maxScore,
    direction: raw.direction,
  }
}

/** EventScore 유니온 파서 — status별로 value/display/reason 형태가 다르다(domain.ts).
 *  records-write-api의 저장 응답 scores 검증도 이 파서를 공유한다(읽기/쓰기 판정 단일화). */
export function parseEventScore(raw: unknown): EventScore | null {
  if (!isPlainObject(raw)) return null
  switch (raw.status) {
    case 'recorded':
      if (typeof raw.value !== 'number' || typeof raw.display !== 'string') return null
      return { status: 'recorded', value: raw.value, display: raw.display }
    case 'exempt':
    case 'unmeasured':
      if (raw.value !== null || raw.display !== null) return null
      return { status: raw.status, value: null, display: null }
    case 'invalid':
      if (typeof raw.display !== 'string' || typeof raw.reason !== 'string') return null
      return { status: 'invalid', value: null, display: raw.display, reason: raw.reason }
    default:
      return null
  }
}

/** scores 맵 파서 — 세션 엔트리와 records-write-api의 저장 응답이 같은 판정을 공유한다. */
export function parseScores(raw: unknown): Record<string, EventScore> | null {
  if (!isPlainObject(raw)) return null
  const scores: Record<string, EventScore> = {}
  for (const [key, value] of Object.entries(raw)) {
    const parsed = parseEventScore(value)
    if (parsed === null) return null
    scores[key] = parsed
  }
  return scores
}

function parseSessionEntry(raw: unknown): SessionEntry | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.playerId !== 'number' || typeof raw.name !== 'string') return null
  if (typeof raw.participated !== 'boolean') return null
  const scores = parseScores(raw.scores)
  if (scores === null) return null
  return { playerId: raw.playerId, name: raw.name, scores, participated: raw.participated }
}

function parseSession(raw: unknown): Session | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.date !== 'string') return null
  const entries = parseArray(raw.entries, parseSessionEntry)
  if (entries === null) return null
  return { date: raw.date, entries }
}

function parseRankingEntry(raw: unknown): RankingEntry | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.playerId !== 'number' || typeof raw.name !== 'string') return null
  if (typeof raw.value !== 'number' || typeof raw.display !== 'string') return null
  if (typeof raw.rank !== 'number' || typeof raw.achieved !== 'boolean') return null
  return {
    playerId: raw.playerId,
    name: raw.name,
    value: raw.value,
    display: raw.display,
    rank: raw.rank,
    achieved: raw.achieved,
  }
}

function parseEventRanking(raw: unknown): EventRanking | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.event !== 'string') return null
  const entries = parseArray(raw.entries, parseRankingEntry)
  if (entries === null) return null
  return { event: raw.event, entries }
}

function parseSessionRankings(raw: unknown): SessionRankings | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.sessionDate !== 'string') return null
  const events = parseArray(raw.events, parseEventRanking)
  if (events === null) return null
  return { sessionDate: raw.sessionDate, events }
}

function parseTrendPoint(raw: unknown): TrendPoint | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.sessionDate !== 'string') return null
  if (typeof raw.value !== 'number' || typeof raw.display !== 'string') return null
  if (typeof raw.achieved !== 'boolean') return null
  if (typeof raw.deltaFromPrevious !== 'number' && raw.deltaFromPrevious !== null) return null
  if (typeof raw.improved !== 'boolean' && raw.improved !== null) return null
  return {
    sessionDate: raw.sessionDate,
    value: raw.value,
    display: raw.display,
    achieved: raw.achieved,
    deltaFromPrevious: raw.deltaFromPrevious,
    improved: raw.improved,
  }
}

function parsePlayerEventTrend(raw: unknown): PlayerEventTrend | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.event !== 'string') return null
  const points = parseArray(raw.points, parseTrendPoint)
  if (points === null) return null
  return { event: raw.event, points }
}

function parsePlayerPersonalBest(raw: unknown): PlayerPersonalBest | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.event !== 'string') return null
  if (typeof raw.value !== 'number' || typeof raw.display !== 'string') return null
  if (typeof raw.sessionDate !== 'string' || typeof raw.achieved !== 'boolean') return null
  return {
    event: raw.event,
    value: raw.value,
    display: raw.display,
    sessionDate: raw.sessionDate,
    achieved: raw.achieved,
  }
}

function parsePlayerSummary(raw: unknown): PlayerSummary | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.id !== 'number' || typeof raw.name !== 'string') return null
  // '탈퇴'는 응답에 나타날 수 없다는 타입 제약(domain.ts PlayerSummary)을 런타임에도 강제.
  if (!isOneOf(raw.status, SUMMARY_STATUSES)) return null
  const trends = parseArray(raw.trends, parsePlayerEventTrend)
  if (trends === null) return null
  const personalBests = parseArray(raw.personalBests, parsePlayerPersonalBest)
  if (personalBests === null) return null
  return { id: raw.id, name: raw.name, status: raw.status, trends, personalBests }
}

function parseEventAchievementRate(raw: unknown): EventAchievementRate | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.event !== 'string') return null
  if (typeof raw.achievedCount !== 'number' || typeof raw.eligibleCount !== 'number') return null
  if (typeof raw.rate !== 'number') return null
  return {
    event: raw.event,
    achievedCount: raw.achievedCount,
    eligibleCount: raw.eligibleCount,
    rate: raw.rate,
  }
}

function parseHomeSummary(raw: unknown): HomeSummary | null {
  if (!isPlainObject(raw)) return null
  let latestSession: HomeSummary['latestSession']
  if (raw.latestSession === null) {
    latestSession = null
  } else {
    if (!isPlainObject(raw.latestSession)) return null
    if (typeof raw.latestSession.date !== 'string') return null
    if (typeof raw.latestSession.participantCount !== 'number') return null
    latestSession = {
      date: raw.latestSession.date,
      participantCount: raw.latestSession.participantCount,
    }
  }
  const achievementRates = parseArray(raw.achievementRates, parseEventAchievementRate)
  if (achievementRates === null) return null
  return { latestSession, achievementRates }
}

export function parseRecordsResponse(raw: unknown): RecordsResponse | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.generatedAt !== 'string') return null
  const events = parseArray(raw.events, parseEventDefinition)
  if (events === null) return null
  const players = parseArray(raw.players, parsePlayerSummary)
  if (players === null) return null
  const sessions = parseArray(raw.sessions, parseSession)
  if (sessions === null) return null
  const rankings = parseArray(raw.rankings, parseSessionRankings)
  if (rankings === null) return null
  const home = parseHomeSummary(raw.home)
  if (home === null) return null
  return { generatedAt: raw.generatedAt, events, players, sessions, rankings, home }
}
