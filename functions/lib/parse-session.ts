// 회차 탭(날짜 이름 탭) 원시 2D 배열을 Session 도메인 타입으로 변환한다.
// 스키마 근거: docs/sheet-integration.html §02, 편집 규칙: docs/sheet-rules.html §01.
// 값 정규화는 normalize-score.ts(이슈 #6 → #20)를 그대로 재사용한다.
//
// 선수 식별 — 이름 텍스트 매칭 (이슈 #60):
// 회차 탭은 "참가자만, 이름 매칭" 포맷이다 — 참가자만 행이 존재하고(비참여자는 행 자체가
// 없음), 행 순서는 명단 행 위치와 무관하다(예: 가나다순 수기 입력). 그래서 행 위치로
// playerId를 도출할 수 없다 — 각 행의 이름 셀(NFC 정규화)을 버니스명단 이름과 매칭해
// playerId를 찾는다. 명단에 없는 이름·명단 내 동명이인(두 명 이상 매칭)은 조용히 넘기지
// 않고 Error를 던진다 — 잘못 매칭된 점수가 다른 사람 기록으로 섞이는 것보다, 새로고침
// 시 에러로 드러나 관리자가 시트를 고치는 편이 안전하다.
//
// players[]는 여전히 모든 상태(활동/탈퇴/비대상/휴식)를 포함한 채로 받는다 — 과거 회차엔
// 지금은 탈퇴한 선수의 기록도 남아있을 수 있어서다(탈퇴 필터링은 build-records-response.ts
// 가 파서 이후에 한 번만 한다). id는 명단 파서(#25)가 원본 행 위치로 고정하므로 결번이
// 있을 수 있지만(functions/lib/roster.ts), 이름 매칭은 배열 인덱스가 아니라 이름→Player
// 맵으로 조회하므로 결번 자체가 이 파서에 영향을 주지 않는다.
//
// 이름→Player 맵(buildPlayersByName)은 호출부에서 한 번만 만들어 parseSession에 넘긴다 —
// build-records-response.ts는 같은 players[]로 회차 탭을 여러 번(bundle.rounds 개수만큼)
// 파싱하는데, 맵을 parseSession 내부에서 매번 재생성하면 그만큼 정규화·삽입 비용이
// 반복된다. players[]는 그 요청 안에서 절대 바뀌지 않으므로 맵도 한 번만 만들면 된다.
//
// 탭 내 중복 검사: 위치 기반 도출 시절엔 playerId가 세션 안에서 자동으로 유일했지만,
// 이름 매칭에서는 같은 사람이 실수로 두 행에 입력될 수 있다. player-summary.ts의
// session.entries.find(...)가 첫 매치만 쓰고 조용히 무시하는 위험이 있어, 같은 playerId가
// 한 회차 탭에 두 번 나오면 이 파서가 즉시 Error를 던진다.
//
// valueKind 교차검증: docs/records-schema.html §03이 "조립 단계(파서/엔드포인트)의 책임"
// 이라고만 적어둔 검증(예: 개수 종목 셀에 1:15 입력)을 이 파서가 흡수한다 — 이미 events[]
// 를 받아 헤더를 매칭하므로 자연스러운 지점이고, Session이 최종 EventScore를 담은 채로
// 나가 하류(#28~#30)가 같은 로직을 재구현할 필요가 없다.
//
// 상태(탈퇴 등) 필터링은 이 파서의 책임이 아니다: 활동/비대상·휴식/탈퇴별로 하류
// 소비자(#28 랭킹은 활동만, #29 추이는 비대상·휴식도 포함)마다 포함 규칙이 달라, 여기서
// 미리 걸러내면 그 정보를 복원할 수 없다.
//
// 회차별 측정 종목 — 헤더가 정본 (이슈 #112, PRD docs/prd-event-lifecycle.html §05):
// 측정 종목은 회차 사이에 추가·종료될 수 있어서, "목표 탭 종목 전체가 모든 회차 탭 헤더에
// 있어야 한다"는 완전일치 강제는 종목을 하나 추가하는 순간 그 컬럼이 없는 과거 회차 탭을
// 전부 에러로 만든다. 그래서 어느 회차에서 무엇을 측정했는지의 정본은 목표 탭이 아니라
// 그 회차 탭 헤더다 — 목표에만 있고 헤더에 없는 종목은 "그 회차 미측정"으로 조용히 빠진다.
// 이 완화(V3) 하나만 풀고 나머지 fail-loud는 그대로 둔다: 목표에 없는 헤더(V1)·중복 헤더·
// 빈 헤더 셀(V2)은 여전히 즉시 에러이고, 종료된 종목이 종료 회차 이후에 다시 나타나는
// 데이터 모순(V4)은 새로 잡는다.

import type { EventDefinition, EventScore, Session, SessionEntry, Player } from '../../shared/domain'
import { buildEventScore } from '../../shared/build-event-score'

const NAME_HEADER = '이름'.normalize('NFC')

export interface EventColumn {
  event: EventDefinition
  columnIndex: number
}

export function parseSession(
  tabName: string,
  rows: string[][],
  playersByName: Map<string, Player[]>,
  events: EventDefinition[],
): Session {
  if (rows.length === 0) {
    throw new Error('회차 탭이 비어 있습니다 (헤더 행조차 없음)')
  }

  const eventColumns = mapHeaderToEvents(rows[0], events, tabName)
  const dataRows = rows.slice(1)

  const entries: SessionEntry[] = []
  const seenPlayerIds = new Set<number>()
  dataRows.forEach((row, index) => {
    const rowNumber = index + 2 // 헤더 제외 시트 행 번호
    const nameCell = (row[0] ?? '').trim()
    const restCells = row.slice(1)
    const isFullyBlank = nameCell === '' && restCells.every((cell) => (cell ?? '').trim() === '')
    if (isFullyBlank) return // Sheets 범위 조회가 실제 데이터보다 더 가져온 경우의 트레일링 아티팩트로 취급

    if (nameCell === '') {
      // restCells 중 하나라도 채워져 있어 isFullyBlank는 아니지만 이름만 없는 경우 — 이름
      // 매칭(아래)에 맡기면 "명단에 없음"으로 오진된다. 실제로는 이름 참조 수식이나 수기
      // 입력이 깨졌거나 지워졌다는 뜻이라 별도 메시지로 정확히 알린다.
      throw new Error(`회차 탭 ${rowNumber}행 이름 셀이 비어 있는데 점수가 입력돼 있습니다 — 이름 입력이 빠졌을 수 있습니다`)
    }

    const normalizedNameCell = nameCell.normalize('NFC')
    const matches = playersByName.get(normalizedNameCell) ?? []

    if (matches.length === 0) {
      throw new Error(
        `회차 탭 ${rowNumber}행 이름("${nameCell}")이 명단에 없습니다 — 오타이거나 버니스명단에 등록되지 않았을 수 있습니다`,
      )
    }
    if (matches.length > 1) {
      throw new Error(
        `회차 탭 ${rowNumber}행 이름("${nameCell}")이 명단에 동명이인으로 ${matches.length}명 있어 특정할 수 없습니다 — 버니스명단에서 이름을 구분해 주세요(예: 선수5, 선수5B)`,
      )
    }

    const player = matches[0]
    if (seenPlayerIds.has(player.id)) {
      throw new Error(`회차 탭 ${rowNumber}행 이름("${nameCell}")이 같은 탭에 중복으로 나타납니다 — 같은 사람이 두 번 입력됐을 수 있습니다`)
    }
    seenPlayerIds.add(player.id)

    const scores: Record<string, EventScore> = {}
    for (const { event, columnIndex } of eventColumns) {
      scores[event.key] = buildEventScore(row[columnIndex], event)
    }

    const participated = Object.values(scores).some((score) => score.status !== 'unmeasured')

    entries.push({ playerId: player.id, name: normalizedNameCell, scores, participated })
  })

  return { date: tabName, entries, eventKeys: eventColumns.map(({ event }) => event.key) }
}

export function buildPlayersByName(players: Player[]): Map<string, Player[]> {
  const byName = new Map<string, Player[]>()
  for (const player of players) {
    const key = player.name.normalize('NFC')
    const bucket = byName.get(key)
    if (bucket) {
      bucket.push(player)
    } else {
      byName.set(key, [player])
    }
  }
  return byName
}

// export: 회차 탭 쓰기 경로(POST /api/admin/records, #64)가 같은 규칙으로 헤더→종목 열을
// 매핑해야 한다(PRD §07 "parse-session의 mapHeaderToEvents와 같은 규칙"). 재구현 대신 재사용.
//
// sessionDate(회차 탭 이름 = 그 회차 날짜)를 필수로 받는 이유는 V4(종료 경계) 때문이다.
// 선택 인자로 두면 호출부가 조용히 V4를 건너뛸 수 있고 그 누락은 타입 검사에 걸리지 않는데,
// 읽기(parseSession)·쓰기(records 엔드포인트) 양쪽 다 이미 날짜를 손에 쥐고 있어 필수화
// 비용이 없다 — 완화와 검증이 두 경로에 항상 같이 적용되는 것이 이 함수를 공유하는 이유다.
export function mapHeaderToEvents(header: string[], events: EventDefinition[], sessionDate: string): EventColumn[] {
  const firstCell = (header[0] ?? '').trim().normalize('NFC')
  if (firstCell !== NAME_HEADER) {
    throw new Error(`회차 탭 헤더 첫 열이 "이름"이 아닙니다: "${header[0] ?? ''}"`)
  }

  const eventByKey = new Map(events.map((event) => [event.key.normalize('NFC'), event]))
  const matchedKeys = new Set<string>()
  const columns: EventColumn[] = []

  for (let columnIndex = 1; columnIndex < header.length; columnIndex++) {
    const rawLabel = header[columnIndex] ?? ''
    const label = rawLabel.trim().normalize('NFC')

    // 헤더 셀은 전부 종목 참조 수식이라 정상 상태에서는 절대 빈 칸일 수 없다(데이터 행의
    // 점수 칸과 달리 "빈 트레일링 셀 생략" 같은 benign 케이스가 없음) — 빈 칸도 그냥
    // "대응 종목 없음"으로 던져 다른 헤더 이상과 동일하게 fail-loud를 유지한다.
    const event = eventByKey.get(label)
    if (!event) {
      throw new Error(
        label === ''
          ? `회차 탭 헤더 ${columnIndex + 1}번째 열이 비어 있습니다 — 종목 참조 수식이 깨졌을 수 있습니다`
          : `회차 탭 헤더 "${rawLabel}"에 대응하는 종목을 목표 탭에서 찾을 수 없습니다`,
      )
    }
    if (matchedKeys.has(label)) {
      throw new Error(`회차 탭 헤더에 "${rawLabel}"가 중복됩니다`)
    }

    // V4 — 종료된 종목이 종료 회차 이후 회차에 다시 나타나면 데이터 모순이다("종료 회차
    // 까지만 데이터가 존재한다"는 PRD §02 R2 위반). 경계는 포함이라 종료 회차 그 자체(마지막
    // 측정 회차)에 컬럼이 있는 것은 정상이고, 초과한 회차만 잡는다.
    // 두 값 다 고정 폭 YYYY-MM-DD라 사전식 비교 = 시간순 비교다 — 형식 보증은 회차 쪽이
    // sheetTabs.ts의 parseRoundDate(캘린더 유효성까지 왕복 검증), 종목 쪽이 목표 탭 파서의
    // 종료 회차 검증(V5)이 각각 책임지므로 여기서 다시 파싱하지 않는다.
    if (event.endSessionDate !== null && sessionDate > event.endSessionDate) {
      throw new Error(
        `회차 탭(${sessionDate}) 헤더에 이미 종료된 종목 "${rawLabel}" 컬럼이 있습니다 — 종료 회차가 ${event.endSessionDate}이므로 그 이후 회차에는 이 종목 기록이 있을 수 없습니다`,
      )
    }

    matchedKeys.add(label)
    columns.push({ event, columnIndex })
  }

  // V3(목표 탭 종목이 회차 헤더에 없음)은 더 이상 에러가 아니다 — 파일 상단 "회차별 측정
  // 종목 — 헤더가 정본" 참고. 여기 있던 missing 검사 제거가 이 이슈(#112)의 핵심 변경이다.
  return columns
}

// buildEventScore(쓰기 경로 #64가 저장 전 값 검증 + 200 응답의 EventScore를 만드는 데도 재사용)는
// Sheets 구조에 의존하지 않는 순수 함수라 shared/build-event-score.ts로 승격했다(#68 — 프론트 입력
// 화면이 같은 함수로 인라인 검증). 여기서는 import해 그대로 재사용한다.
