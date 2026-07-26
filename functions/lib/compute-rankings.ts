// 회차·종목별 랭킹 계산 — 순수 함수. 파서(#21) 완성을 기다리지 않고 shared/domain.ts 타입만으로 동작.
// 동점·달성·상태 정책 규칙은 이 파일에서 새로 정하지 않고 docs/records-schema.html §02·§04(PR #16 승인)를 그대로 구현한다.

import type {
  EventDefinition,
  EventRanking,
  Player,
  RankingEntry,
  Session,
  SessionEntry,
  SessionRankings,
} from '../../shared/domain'

interface RankedCandidate {
  playerId: number
  name: string
  value: number
  display: string
}

function isAchieved(event: EventDefinition, value: number): boolean {
  return event.direction === '낮을수록' ? value <= event.targetValue : value >= event.targetValue
}

function compareByDirection(direction: EventDefinition['direction'], a: number, b: number): number {
  return direction === '낮을수록' ? a - b : b - a
}

/** 종목 1개에 대한 랭킹. 활동 상태 + recorded 점수만 대상 — 탈퇴·비대상·휴식과
 *  면제·미측정·이상값은 한 번에 걸러진다(records-schema.html §02·§04). */
export function computeEventRanking(event: EventDefinition, entries: SessionEntry[], players: Player[]): EventRanking {
  const activePlayerIds = new Set(players.filter((player) => player.status === '활동').map((player) => player.id))

  const candidates: RankedCandidate[] = []
  for (const entry of entries) {
    if (!activePlayerIds.has(entry.playerId)) continue
    // scores[event.key]는 계약상(shared/domain.ts:57-58) 항상 존재하지만, 그 보장을 만드는
    // 파서(#27)가 아직 없는 상태라 방어적으로 optional chaining — player.status 재확인과 대칭.
    const score = entry.scores[event.key]
    if (score?.status !== 'recorded') continue
    candidates.push({ playerId: entry.playerId, name: entry.name, value: score.value, display: score.display })
  }

  candidates.sort((a, b) => compareByDirection(event.direction, a.value, b.value))

  // 표준 공동순위(1,1,3): 값이 같으면 이전 rank를 재사용, 다르면 index+1 — 동점자 수만큼 다음 등수가 밀린다.
  const entriesRanked: RankingEntry[] = []
  let previousValue: number | null = null
  let previousRank = 0
  candidates.forEach((candidate, index) => {
    const rank = candidate.value === previousValue ? previousRank : index + 1
    previousValue = candidate.value
    previousRank = rank
    entriesRanked.push({
      playerId: candidate.playerId,
      name: candidate.name,
      value: candidate.value,
      display: candidate.display,
      rank,
      achieved: isAchieved(event, candidate.value),
    })
  })

  return { event: event.key, entries: entriesRanked }
}

/** 회차 1개에 대한 종목별 랭킹 묶음. 그 회차 Session.eventKeys에 해당하는 종목만, 헤더 순서로
 *  담는다(shared/domain.ts SessionRankings.events 계약) — 미측정 종목×회차 조합은 항목 자체가 없다.
 *  eventKeys에 있는데 events(목표 탭)에 없는 key는 조용히 건너뛴다: 파서(#111/#112)가 이 불변식을
 *  보장하지만, 이 파일은 그 완성을 기다리지 않고 Session 픽스처만으로 개발되므로 방어적으로 둔다. */
export function computeSessionRankings(session: Session, events: EventDefinition[], players: Player[]): SessionRankings {
  const eventsByKey = new Map(events.map((event) => [event.key, event]))
  return {
    sessionDate: session.date,
    events: session.eventKeys
      .map((key) => eventsByKey.get(key))
      .filter((event): event is EventDefinition => event !== undefined)
      .map((event) => computeEventRanking(event, session.entries, players)),
  }
}
