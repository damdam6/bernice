// POST /api/admin/add-players 순수 로직 — 요청 검증 + 회차 탭 맨 아래에 쓸 이름 참조 수식 행 조립.
// I/O(탭 조회·쓰기·캐시)는 엔드포인트(functions/api/admin/add-players.ts)가 맡고, 이 모듈은
// 순수 함수로만 남겨 vitest로 촘촘히 검증한다(build-records-response.ts ↔ records.ts와 같은 분리).
//
// 회차 탭 A열은 이름 참조 수식(='버니스명단'!A{행})이다(scripts/seed-sheet.mjs). 선수 신원은
// 명단 행 위치(Player.id, roster.ts) — 명단 시트 실제 행 = id + 1(헤더 1행 제외분). 참가 여부는
// 시스템 전반과 동일하게 "이름"으로 판정한다(parse-session.ts, PRD §07): 회차 탭 A열의 (평가된)
// 이름 집합과 요청 선수의 명단 이름을 NFC 정규화 후 대조한다.
//
// "이미 참가자면 거부"는 배치 전체 거부다(부분 쓰기 없음) — 하나라도 충돌하면 아무것도 쓰지 않고
// 충돌 id 목록과 함께 already_participant로 던진다. 프론트의 후보 제외를 뚫고 들어온 요청(레이스
// 등)에 대한 백스톱.

import type { Player } from '../../shared/domain'
import { quoteSheetName } from './sheetsApi'

const ACTIVE_STATUS = '활동'

export type AddPlayersErrorCode = 'validation_failed' | 'already_participant'

export class AddPlayersError extends Error {
  constructor(
    readonly code: AddPlayersErrorCode,
    message: string,
    /** already_participant일 때만 채워짐 — 이미 그 회차에 있는 요청 선수 id들 */
    readonly conflictPlayerIds?: number[],
  ) {
    super(message)
    this.name = 'AddPlayersError'
  }
}

export interface AddedPlayer {
  playerId: number
  name: string
}

export interface AddPlayersPlan {
  /** USER_ENTERED로 쓸 A열 수식 행들 (요청 id 오름차순, 1행 1셀) */
  rows: string[][]
  /** 쓰기를 시작할 1-based 시트 행 번호 (기존 마지막 비공백 행 + 1) */
  startRow: number
  /** 추가된 선수 (요청 id 오름차순) */
  added: AddedPlayer[]
}

export interface BuildAddPlayersPlanInput {
  /** 명단 탭 원본(비정규화) 이름 — 참조 수식의 대상 탭 */
  rosterName: string
  /** 명단 파서 결과 (모든 상태 포함) */
  players: Player[]
  /** 대상 회차 탭 원시 2D 값 (헤더 포함) */
  roundValues: string[][]
  /** 추가할 선수 id 목록 */
  playerIds: number[]
}

function isRowBlank(row: string[] | undefined): boolean {
  return (row ?? []).every((cell) => (cell ?? '').trim() === '')
}

// 회차 탭에서 "맨 아래" = 마지막 비공백 행의 다음. batchGet은 트레일링 빈 행을 대개 잘라 주지만,
// 셀 하나만 남은 유령 행 등에 대비해 뒤에서부터 완전 빈 행을 트림한 뒤 +1 한다. 헤더만 있는 탭이면
// startRow=2(헤더 다음), 완전 빈 배열이면 1.
function computeStartRow(roundValues: string[][]): number {
  let lastRow = roundValues.length
  while (lastRow > 0 && isRowBlank(roundValues[lastRow - 1])) lastRow--
  return lastRow + 1
}

// 회차 탭 A열(헤더 제외)의 이름 집합 — 참가 여부 판정용. 빈 이름 셀은 넣지 않는다.
function collectExistingNames(roundValues: string[][]): Set<string> {
  const names = new Set<string>()
  for (const row of roundValues.slice(1)) {
    const name = (row[0] ?? '').trim()
    if (name !== '') names.add(name.normalize('NFC'))
  }
  return names
}

export function buildAddPlayersPlan(input: BuildAddPlayersPlanInput): AddPlayersPlan {
  const { rosterName, players, roundValues, playerIds } = input

  if (playerIds.length === 0) {
    throw new AddPlayersError('validation_failed', '추가할 선수를 한 명 이상 지정해야 합니다.')
  }
  for (const id of playerIds) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new AddPlayersError('validation_failed', `선수 id는 1 이상의 정수여야 합니다: ${id}`)
    }
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new AddPlayersError('validation_failed', '중복된 선수 id가 요청에 포함돼 있습니다.')
  }

  const playersById = new Map(players.map((player) => [player.id, player]))

  // 존재·활동 검증 — 하나라도 어긋나면 즉시 400(첫 오프너 기준).
  for (const id of playerIds) {
    const player = playersById.get(id)
    if (!player) {
      throw new AddPlayersError('validation_failed', `명단에 없는 선수 id입니다: ${id}`)
    }
    if (player.status !== ACTIVE_STATUS) {
      throw new AddPlayersError(
        'validation_failed',
        `활동 상태가 아닌 선수는 추가할 수 없습니다: ${player.name}(${player.status})`,
      )
    }
  }

  // 이미 참가자 검증 — 전부 모아 거부(배치 전체 롤백 의미).
  const existingNames = collectExistingNames(roundValues)
  const conflictPlayerIds = playerIds.filter((id) => existingNames.has(playersById.get(id)!.name.normalize('NFC')))
  if (conflictPlayerIds.length > 0) {
    const names = conflictPlayerIds.map((id) => playersById.get(id)!.name).join(', ')
    throw new AddPlayersError(
      'already_participant',
      `이미 그 회차에 있는 선수가 요청에 포함돼 있습니다: ${names}`,
      conflictPlayerIds,
    )
  }

  // 물리 순서는 사이트 표시(가나다 정렬)와 무관하므로 결정성만 확보 — id 오름차순으로 고정.
  const sortedIds = [...playerIds].sort((a, b) => a - b)
  const quotedRoster = quoteSheetName(rosterName)
  const rows = sortedIds.map((id) => [`=${quotedRoster}!A${id + 1}`])
  const added = sortedIds.map((id) => ({ playerId: id, name: playersById.get(id)!.name }))

  return { rows, startRow: computeStartRow(roundValues), added }
}
