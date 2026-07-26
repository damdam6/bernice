// SheetRawBundle(#24) → RecordsResponse(#21 계약) 조립.
// 파서(#25~#27)·계산(#28~#29)은 순수 함수 그대로 재사용하고, 이 파일이 새로 맡는 것은:
//  1) 명단/목표 탭 누락을 구분 가능한 에러로 승격
//  2) 탈퇴 선수를 sessions[].entries에서 제외 (parse-session.ts가 의도적으로 미루는 책임 —
//     docs/records-schema.html §02: 탈퇴는 sessions/rankings/home 어디에도 등장하지 않는다)
//  3) HomeSummary까지 포함한 최종 응답 envelope 조립
// 탈퇴 필터링은 여기서 한 번만 하고, 그 결과를 sessions 필드에도 rankings/player-summary/
// home 계산 입력에도 동일하게 재사용한다 — computeEventRanking·computePlayerSummaries는
// 어차피 활동/비탈퇴만 보므로 결과는 같고, 소스가 하나뿐이라 어긋날 일이 없다.

import type { EventDefinition, Player, RecordsResponse, Session } from '../../shared/domain'
import type { RoundRawTable, SheetRawBundle } from './sheetsApi'
import { parseRoster } from './roster'
import { parseGoals } from './parse-goals'
import { buildPlayersByName, parseSession } from './parse-session'
import { computeSessionRankings } from './compute-rankings'
import { computePlayerSummaries } from './player-summary'
import { computeHomeSummary } from './compute-home-summary'

export type RecordsAssemblyErrorCode = 'missing_roster_tab' | 'missing_goals_tab'

export class RecordsAssemblyError extends Error {
  constructor(
    readonly code: RecordsAssemblyErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RecordsAssemblyError'
  }
}

// V6(docs/prd-event-lifecycle.html §05) — 종료 회차는 실존하는 회차 탭 이름과 일치해야 한다.
// 회차 목록을 아는 곳이 조립 단계뿐이라 여기서만 대조 가능하다. V4(parse-session.ts)가 "종료
// 회차 초과 회차에 컬럼 존재"를 잡는 것과 별개로, 이 검증은 애초에 종료 회차 자체가 오타로
// 존재하지 않는 날짜를 가리키는 경우(조용히 "영원히 현역"이거나 조용히 모순이 되는 것)를 막는다.
function validateEndSessionDates(events: EventDefinition[], rounds: RoundRawTable[]): void {
  const roundNames = new Set(rounds.map((round) => round.name))
  for (const event of events) {
    if (event.endSessionDate !== null && !roundNames.has(event.endSessionDate)) {
      throw new Error(
        `목표 탭 종목 "${event.key}"의 종료 회차(${event.endSessionDate})에 해당하는 회차 탭을 찾을 수 없습니다 — 오타이거나 그 회차 탭이 아직 생성되지 않았을 수 있습니다`,
      )
    }
  }
}

function excludeWithdrawn(session: Session, playersById: Map<number, Player>): Session {
  return {
    date: session.date,
    entries: session.entries.filter((entry) => playersById.get(entry.playerId)?.status !== '탈퇴'),
    eventKeys: session.eventKeys,
  }
}

export function buildRecordsResponse(bundle: SheetRawBundle, generatedAt: string): RecordsResponse {
  if (bundle.roster === null) {
    throw new RecordsAssemblyError('missing_roster_tab', '버니스명단 탭을 찾을 수 없습니다.')
  }
  if (bundle.goals === null) {
    throw new RecordsAssemblyError('missing_goals_tab', '목표 탭을 찾을 수 없습니다.')
  }

  const { players } = parseRoster(bundle.roster.values)
  const { events } = parseGoals(bundle.goals.values)
  validateEndSessionDates(events, bundle.rounds)
  const playersById = new Map(players.map((player) => [player.id, player]))
  // 회차 탭마다 이름→Player 맵을 다시 만들지 않도록 한 번만 생성해 재사용한다 —
  // players[]는 이 요청 안에서 바뀌지 않으므로 bundle.rounds 개수만큼 반복해서
  // 정규화·삽입 비용을 치를 이유가 없다(functions/lib/parse-session.ts 상단 주석 참고).
  const playersByName = buildPlayersByName(players)

  const sessions = bundle.rounds.map((round) => {
    const parsed = parseSession(round.name, round.values, playersByName, events)
    return excludeWithdrawn(parsed, playersById)
  })

  const rankings = sessions.map((session) => computeSessionRankings(session, events, players))
  const playerSummaries = computePlayerSummaries(events, players, sessions)
  const home = computeHomeSummary(sessions, rankings, players)

  return {
    generatedAt,
    events,
    players: playerSummaries,
    sessions,
    rankings,
    home,
  }
}
