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
    const score = entry.scores[event.key]
    if (score.status !== 'recorded') continue
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

/** 회차 1개에 대한 종목별 랭킹 묶음. 엔트리가 0건인 종목도 entries: []로 유지해
 *  events[] 전체와 개수를 맞춘다(프론트 종목 탭이 회차마다 사라지지 않도록). */
export function computeSessionRankings(session: Session, events: EventDefinition[], players: Player[]): SessionRankings {
  return {
    sessionDate: session.date,
    events: events.map((event) => computeEventRanking(event, session.entries, players)),
  }
}
