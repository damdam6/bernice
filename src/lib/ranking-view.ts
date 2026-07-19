// 랭킹 화면 파생 로직 — 디자인 PRD §05 "미측정·면제·이상값 행은 sessions[].entries에서
// 보충해 하단 배치"(#70)의 구현. rankings[].events[].entries(순위권)는 그대로 쓰고,
// 그 회차의 원본 sessions[].entries에서 활동 상태 + 아직 순위권에 없는 선수만 보충한다.
// session.entries를 순회 기준으로 삼으므로 그 회차에 엔트리 자체가 없는 선수(가입 이전 회차 등,
// domain.ts Session 주석)는 자동으로 제외된다 — 별도 가드가 필요 없다.
import type { EventDefinition, EventRanking, PlayerSummary, RankDirection, RankingEntry, Session } from '../../shared/domain'

export type RankingRowDatum =
  | ({ status: 'recorded' } & RankingEntry)
  | { status: 'exempt' | 'unmeasured'; playerId: number; name: string }
  | { status: 'invalid'; playerId: number; name: string; display: string }

/** 종목 1개·회차 1개의 표시용 행 목록 — 순위권(오름차순) 다음에 보충 행(회차 원본 순서)이 이어진다. */
export function buildRankingRows(
  eventRanking: EventRanking,
  session: Session,
  eventKey: string,
  players: PlayerSummary[],
): RankingRowDatum[] {
  const activePlayerIds = new Set(players.filter((player) => player.status === '활동').map((player) => player.id))
  const rankedIds = new Set(eventRanking.entries.map((entry) => entry.playerId))

  const recorded: RankingRowDatum[] = eventRanking.entries.map((entry) => ({ status: 'recorded', ...entry }))

  const supplemental: RankingRowDatum[] = []
  for (const entry of session.entries) {
    if (!activePlayerIds.has(entry.playerId) || rankedIds.has(entry.playerId)) continue

    const score = entry.scores[eventKey]
    if (score.status === 'exempt' || score.status === 'unmeasured') {
      supplemental.push({ status: score.status, playerId: entry.playerId, name: entry.name })
    } else if (score.status === 'invalid') {
      supplemental.push({ status: 'invalid', playerId: entry.playerId, name: entry.name, display: score.display })
    }
    // score.status === 'recorded'는 여기 도달 불가 — 활동+recorded는 rankedIds에 이미 있다(§02).
  }

  return [...recorded, ...supplemental]
}

/** 공동순위 판정 — recorded 행만 대상으로 rank별 개수를 세어 2개 이상이면 "공동"으로 표기. */
export function findTiedRanks(rows: RankingRowDatum[]): Set<number> {
  const counts = new Map<number, number>()
  for (const row of rows) {
    if (row.status !== 'recorded') continue
    counts.set(row.rank, (counts.get(row.rank) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([rank]) => rank))
}

const DIRECTION_TAIL: Record<RankDirection, string> = {
  낮을수록: '낮을수록 좋음 ↓',
  높을수록: '높을수록 좋음 ↑',
}

/** 종목 안내문 — PRD §05 예시("목표 1'17" 이내 · 낮을수록 좋음 ↓" / "목표 5개 이상 · / 10")를
 *  maxScore 유무 + direction 두 축만으로 재현한다. target은 원본 표시값을 그대로 쓴다(콜론 유지). */
export function buildEventGuidance(event: EventDefinition): string {
  const unit = event.valueKind === 'count' ? '개' : ''
  const boundary = event.direction === '낮을수록' ? '이내' : '이상'
  const tail = event.maxScore != null ? `/ ${event.maxScore}` : DIRECTION_TAIL[event.direction]
  return `목표 ${event.target}${unit} ${boundary} · ${tail}`
}
