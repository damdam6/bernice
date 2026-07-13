// 회차 탭(날짜 이름 탭) 원시 2D 배열을 Session 도메인 타입으로 변환한다.
// 스키마 근거: docs/sheet-integration.html §02, 편집 규칙: docs/sheet-rules.html §01.
// 값 정규화는 normalize-score.ts(이슈 #6 → #20)를 그대로 재사용한다.
//
// 선수 식별 — 행 위치가 1차 키, 이름은 무결성 검증:
// 회차 탭 데이터 행 N(1부터, 헤더 제외)은 항상 '버니스명단'!A(N+1)을 참조하는 수식이라
// (전원 미러링 + append-only 규칙, docs/sheet-rules.html §01), playerId = N을 행 위치로
// 직접 도출한다 — Player.id(shared/domain.ts, "행 위치 기반 파생값")와 같은 축이다.
// 이름 셀은 그 수식이 실제로 명단과 일치하는지 확인하는 2차 검증으로만 쓴다. 불일치는
// 명단 행 삭제·재배치 같은 편집 규칙 위반이 실제로 일어났다는 뜻이라 조용히 넘기지
// 않고 Error를 던진다 — 잘못 매칭된 점수가 다른 사람 기록으로 섞이는 것보다, 새로고침
// 시 에러로 드러나 관리자가 시트를 고치는 편이 안전하다.
//
// valueKind 교차검증: docs/records-schema.html §03이 "조립 단계(파서/엔드포인트)의 책임"
// 이라고만 적어둔 검증(예: 개수 종목 셀에 1:15 입력)을 이 파서가 흡수한다 — 이미 events[]
// 를 받아 헤더를 매칭하므로 자연스러운 지점이고, Session이 최종 EventScore를 담은 채로
// 나가 하류(#28~#30)가 같은 로직을 재구현할 필요가 없다.
//
// 상태(탈퇴 등) 필터링은 이 파서의 책임이 아니다: 활동/비대상·휴식/탈퇴별로 하류
// 소비자(#28 랭킹은 활동만, #29 추이는 비대상·휴식도 포함)마다 포함 규칙이 달라, 여기서
// 미리 걸러내면 그 정보를 복원할 수 없다. players[]는 오직 이름 무결성 검증에만 쓴다.

import type { EventDefinition, EventScore, Session, SessionEntry, Player } from '../../shared/domain'
import { normalizeScore } from './normalize-score'

const NAME_HEADER = '이름'.normalize('NFC')

interface EventColumn {
  event: EventDefinition
  columnIndex: number
}

export function parseSession(
  tabName: string,
  rows: string[][],
  players: Player[],
  events: EventDefinition[],
): Session {
  if (rows.length === 0) {
    throw new Error('회차 탭이 비어 있습니다 (헤더 행조차 없음)')
  }

  const eventColumns = mapHeaderToEvents(rows[0], events)
  const dataRows = rows.slice(1)

  // 행 수가 players.length를 넘는지는 여기서 일괄 검사하지 않는다 — 초과분이 완전히 빈
  // 트레일링 행(범위 조회 아티팩트)이면 아래 루프에서 스킵되는 게 맞고, 실제로 명단에
  // 없는 위치를 참조하는 행이어야만 아래 !player 체크에서 걸린다.
  const entries: SessionEntry[] = []
  dataRows.forEach((row, index) => {
    const nameCell = (row[0] ?? '').trim()
    const restCells = row.slice(1)
    const isFullyBlank = nameCell === '' && restCells.every((cell) => (cell ?? '').trim() === '')
    if (isFullyBlank) return // Sheets 범위 조회가 실제 데이터보다 더 가져온 경우의 트레일링 아티팩트로 취급

    const playerId = index + 1
    const player = players[index]
    if (!player) {
      throw new Error(`회차 탭 ${index + 2}행이 명단에 없는 위치를 참조합니다 (playerId=${playerId})`)
    }

    const normalizedNameCell = nameCell.normalize('NFC')
    const normalizedPlayerName = player.name.normalize('NFC')
    if (normalizedNameCell !== normalizedPlayerName) {
      throw new Error(
        `회차 탭 ${index + 2}행 이름("${nameCell}")이 명단 ${playerId}번("${player.name}")과 일치하지 않습니다 — 명단 행 순서가 어긋났을 수 있습니다`,
      )
    }

    const scores: Record<string, EventScore> = {}
    for (const { event, columnIndex } of eventColumns) {
      scores[event.key] = buildEventScore(row[columnIndex], event)
    }

    const participated = Object.values(scores).some((score) => score.status !== 'unmeasured')

    entries.push({ playerId, name: normalizedNameCell, scores, participated })
  })

  return { date: tabName, entries }
}

function mapHeaderToEvents(header: string[], events: EventDefinition[]): EventColumn[] {
  const firstCell = (header[0] ?? '').trim().normalize('NFC')
  if (firstCell !== NAME_HEADER) {
    throw new Error(`회차 탭 헤더 첫 열이 "이름"이 아닙니다: "${header[0] ?? ''}"`)
  }

  const eventByKey = new Map(events.map((event) => [event.key.normalize('NFC'), event]))
  const matchedKeys = new Set<string>()
  const columns: EventColumn[] = []

  for (let columnIndex = 1; columnIndex < header.length; columnIndex++) {
    const label = (header[columnIndex] ?? '').trim().normalize('NFC')
    if (label === '') continue // 트레일링 빈 헤더 셀은 무시

    const event = eventByKey.get(label)
    if (!event) {
      throw new Error(`회차 탭 헤더 "${header[columnIndex]}"에 대응하는 종목을 목표 탭에서 찾을 수 없습니다`)
    }
    if (matchedKeys.has(label)) {
      throw new Error(`회차 탭 헤더에 "${header[columnIndex]}"가 중복됩니다`)
    }

    matchedKeys.add(label)
    columns.push({ event, columnIndex })
  }

  const missing = events.filter((event) => !matchedKeys.has(event.key.normalize('NFC')))
  if (missing.length > 0) {
    throw new Error(`회차 탭 헤더에 다음 종목 컬럼이 없습니다: ${missing.map((event) => event.key).join(', ')}`)
  }

  return columns
}

function buildEventScore(cell: string | undefined, event: EventDefinition): EventScore {
  const normalized = normalizeScore(cell ?? null)

  switch (normalized.kind) {
    case 'exempt':
      return { status: 'exempt', value: null, display: null }
    case 'blank':
      return { status: 'unmeasured', value: null, display: null }
    case 'invalid':
      return { status: 'invalid', value: null, display: normalized.raw.trim(), reason: normalized.reason }
    case 'count':
    case 'seconds': {
      const matchesValueKind =
        (normalized.kind === 'count' && event.valueKind === 'count') ||
        (normalized.kind === 'seconds' && event.valueKind === 'time')

      if (!matchesValueKind) {
        return {
          status: 'invalid',
          value: null,
          display: normalized.raw.trim(),
          reason: `종목 형식(${event.valueKind})과 입력 형식(${normalized.kind})이 다릅니다`,
        }
      }

      return { status: 'recorded', value: normalized.value, display: normalized.raw.trim() }
    }
  }
}
