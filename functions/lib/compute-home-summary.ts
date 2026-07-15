// 홈 요약(HomeSummary) 계산 — 최신 회차 참여 인원 · 종목별 달성률.
// eligibleCount/achievedCount는 새로 필터를 짜지 않고 이미 §04 규칙(활동+recorded)대로
// 계산된 최신 회차 SessionRankings를 그대로 집계한다 — computeEventRanking(#28)과 같은
// 필터를 두 곳에 중복 구현하면 두 규칙이 어긋날 위험이 생기기 때문.

import type { HomeSummary, Player, Session, SessionRankings } from '../../shared/domain'

/** rankings는 sessions와 같은 순서로 1:1 대응(호출자가 sessions.map(computeSessionRankings)로
 *  만들었다는 전제) — 그래서 sessions.at(-1)과 rankings.at(-1)이 항상 같은 회차를 가리킨다. */
export function computeHomeSummary(sessions: Session[], rankings: SessionRankings[], players: Player[]): HomeSummary {
  const latestSession = sessions.at(-1)
  const latestRankings = rankings.at(-1)

  if (!latestSession || !latestRankings) {
    return { latestSession: null, achievementRates: [] }
  }

  const activePlayerIds = new Set(players.filter((player) => player.status === '활동').map((player) => player.id))
  const participantCount = latestSession.entries.filter(
    (entry) => activePlayerIds.has(entry.playerId) && entry.participated,
  ).length

  const achievementRates = latestRankings.events.map((eventRanking) => {
    const eligibleCount = eventRanking.entries.length
    const achievedCount = eventRanking.entries.filter((entry) => entry.achieved).length
    return {
      event: eventRanking.event,
      achievedCount,
      eligibleCount,
      rate: eligibleCount === 0 ? 0 : achievedCount / eligibleCount,
    }
  })

  return {
    latestSession: { date: latestSession.date, participantCount },
    achievementRates,
  }
}
