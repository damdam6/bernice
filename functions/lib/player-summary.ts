import type {
  EventDefinition,
  Player,
  PlayerEventTrend,
  PlayerPersonalBest,
  PlayerStatus,
  PlayerSummary,
  RankDirection,
  Session,
  TrendPoint,
} from '../../shared/domain'

interface ValidScore {
  sessionDate: string
  value: number
  display: string
}

function isAchieved(direction: RankDirection, value: number, targetValue: number): boolean {
  return direction === '낮을수록' ? value <= targetValue : value >= targetValue
}

function isImproved(direction: RankDirection, delta: number): boolean {
  return direction === '낮을수록' ? delta < 0 : delta > 0
}

function isActivePlayer(player: Player): player is Player & { status: Exclude<PlayerStatus, '탈퇴'> } {
  return player.status !== '탈퇴'
}

// entries가 없는 세션(아직 미가입)은 unmeasured로도 취급하지 않고 조용히 건너뛴다.
// 입력 sessions의 정렬을 신뢰하지 않고 sessionDate 기준으로 직접 정렬한다(방어적).
function collectValidScores(player: Player, event: EventDefinition, sessions: Session[]): ValidScore[] {
  const scores: ValidScore[] = []

  for (const session of sessions) {
    const entry = session.entries.find((candidate) => candidate.playerId === player.id)
    if (!entry) continue

    const score = entry.scores[event.key]
    if (score.status !== 'recorded') continue

    scores.push({ sessionDate: session.date, value: score.value, display: score.display })
  }

  return scores.sort((a, b) => (a.sessionDate < b.sessionDate ? -1 : a.sessionDate > b.sessionDate ? 1 : 0))
}

function buildTrend(event: EventDefinition, scores: ValidScore[]): PlayerEventTrend {
  const points: TrendPoint[] = []
  let previous: ValidScore | null = null

  for (const score of scores) {
    const deltaFromPrevious = previous ? score.value - previous.value : null

    points.push({
      sessionDate: score.sessionDate,
      value: score.value,
      display: score.display,
      achieved: isAchieved(event.direction, score.value, event.targetValue),
      deltaFromPrevious,
      improved: deltaFromPrevious === null ? null : isImproved(event.direction, deltaFromPrevious),
    })

    previous = score
  }

  return { event: event.key, points }
}

// 동률 시 최초로 그 값을 달성한(가장 이른) 회차를 PB 회차로 고정한다 —
// 타이 기록은 PB를 다시 세우는 게 아니라 기존 PB를 유지하는 것으로 본다.
function buildPersonalBest(event: EventDefinition, scores: ValidScore[]): PlayerPersonalBest | null {
  if (scores.length === 0) return null

  const best = scores.reduce((a, b) => {
    if (a.value !== b.value) {
      const aIsBetter = event.direction === '낮을수록' ? a.value < b.value : a.value > b.value
      return aIsBetter ? a : b
    }
    return a.sessionDate <= b.sessionDate ? a : b
  })

  return {
    event: event.key,
    value: best.value,
    display: best.display,
    sessionDate: best.sessionDate,
    achieved: isAchieved(event.direction, best.value, event.targetValue),
  }
}

export function computePlayerSummaries(
  events: EventDefinition[],
  players: Player[],
  sessions: Session[],
): PlayerSummary[] {
  return players.filter(isActivePlayer).map((player) => {
    const scoresByEvent = events.map((event) => collectValidScores(player, event, sessions))

    return {
      id: player.id,
      name: player.name,
      status: player.status,
      trends: events.map((event, i) => buildTrend(event, scoresByEvent[i])),
      personalBests: events
        .map((event, i) => buildPersonalBest(event, scoresByEvent[i]))
        .filter((pb): pb is PlayerPersonalBest => pb !== null),
    }
  })
}
