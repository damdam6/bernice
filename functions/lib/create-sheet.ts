// 회차 탭 생성(P5)의 순수 로직 — 참가자 검증·가나다 정렬·명시적 sheetId 선정·batchUpdate requests
// 조립을 fetch 없이 담당한다. I/O(메타/값 읽기·batchUpdate 쓰기·캐시 무효화)는 엔드포인트
// (functions/api/admin/create-sheet.ts)가 하고, 여기 결과의 requests를 그대로 batchUpdate에 넘긴다.
//
// 회차 탭 포맷은 "참가자만, 이름 매칭"(docs/prd-record-input.html §03①, parse-session.ts 주석):
// 참가자 행만 존재하고(가나다 정렬), 명단 연결은 행 위치가 아니라 이름 셀 매칭이다. 헤더 종목·이름
// 모두 참조 수식으로 써서(scripts/seed-sheet.mjs와 동일) 목표·명단 편집이 회차 탭에 자동 반영된다.

import type { EventDefinition, Player } from '../../shared/domain'
import { quoteSheetName } from './sheetsApi'

export interface CreateSheetParticipant {
  id: number
  name: string
}

export interface BuildCreateSheetParams {
  /** 오늘(KST) YYYY-MM-DD — 새 회차 탭 이름 */
  sessionDate: string
  /** 기존 탭 sheetId 목록 — 새 탭에 부여할 빈 id 선정용 */
  existingSheetIds: number[]
  /** 버니스명단 원본 탭 이름 — 이름 참조 수식에 그대로 사용(quoteSheetName으로 quoting) */
  rosterName: string
  /** 목표 원본 탭 이름 — 종목 헤더 참조 수식에 그대로 사용 */
  goalsName: string
  /** parseGoals 결과 — 헤더 종목 컬럼 개수/순서 */
  events: EventDefinition[]
  /** parseRoster 결과 (전 상태 포함) — 참가자 활동 여부·이름 조회 */
  players: Player[]
  /** 요청이 고른 참가자 id */
  participantIds: number[]
}

export type BuildCreateSheetResult =
  | {
      ok: true
      sessionDate: string
      sheetId: number
      requests: unknown[]
      /** 가나다 정렬된 참가자 — 응답 바디에도 그대로 노출 */
      participants: CreateSheetParticipant[]
    }
  | { ok: false; code: 'no_participants' }
  | { ok: false; code: 'invalid_participants'; invalidIds: number[] }

export function buildCreateSheetPlan(params: BuildCreateSheetParams): BuildCreateSheetResult {
  const { sessionDate, existingSheetIds, rosterName, goalsName, events, players, participantIds } = params

  // 활동 선수만 참가 대상 — id로 조회한다. parseRoster가 name을 이미 NFC 정규화해 두므로
  // 가나다 비교에 그대로 쓸 수 있다(roster.ts:67).
  const activeById = new Map<number, Player>()
  for (const player of players) {
    if (player.status === '활동') activeById.set(player.id, player)
  }

  // 프론트 모달이 실수로 같은 id를 두 번 보내도 한 행만 만든다.
  const uniqueIds = [...new Set(participantIds)]
  if (uniqueIds.length === 0) return { ok: false, code: 'no_participants' }

  // 명단에 없거나 활동 상태가 아닌 id는 조용히 거르지 않고 계약(invalidIds)으로 되돌려준다 —
  // 프론트가 어느 선택이 문제인지 알 수 있게. (모달은 활동만 노출하지만 서버가 신뢰 원천)
  const invalidIds = uniqueIds.filter((id) => !activeById.has(id))
  if (invalidIds.length > 0) return { ok: false, code: 'invalid_participants', invalidIds }

  const participants: CreateSheetParticipant[] = uniqueIds.map((id) => {
    const player = activeById.get(id)!
    return { id, name: player.name }
  })
  // 가나다 정렬: 한글 완성형 음절(U+AC00–U+D7A3)은 유니코드 블록이 초성→중성→종성 = 가나다 순으로
  // 배열돼 있어, NFC 문자열(모두 BMP·단일 코드유닛)의 코드유닛 비교가 곧 가나다 순이다. Workers
  // 런타임의 불확실한 Intl 로케일에 기대지 않는다. 동명이인은 id로 안정 정렬한다.
  participants.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id))

  // 같은 batchUpdate 배치의 updateCells가 새 탭을 forward-reference하려면 sheetId를 미리 알아야 한다.
  // 기존 id와 겹치지 않게 max+1(기존 없으면 0). 회차 탭은 addSheet로 새로 만들 뿐이라 이 값이 실제로
  // 사용 중일 수 없어 충돌하지 않는다.
  const newSheetId = existingSheetIds.reduce((max, id) => Math.max(max, id), -1) + 1

  const requests = buildBatchRequests({ sessionDate, sheetId: newSheetId, rosterName, goalsName, events, participants })
  return { ok: true, sessionDate, sheetId: newSheetId, requests, participants }
}

function buildBatchRequests(args: {
  sessionDate: string
  sheetId: number
  rosterName: string
  goalsName: string
  events: EventDefinition[]
  participants: CreateSheetParticipant[]
}): unknown[] {
  const { sessionDate, sheetId, rosterName, goalsName, events, participants } = args
  const goalsRef = quoteSheetName(goalsName)
  const rosterRef = quoteSheetName(rosterName)

  // 헤더: 이름 + 종목명(목표 탭 참조 수식). 목표 데이터 행은 A2부터라 i번째 종목 = A{i+2}.
  // 목표 탭이 빈 행 없이 연속이라는 전제는 시딩(scripts/seed-sheet.mjs:138)·파서와 동일하다.
  const headerCells = [
    { userEnteredValue: { stringValue: '이름' } },
    ...events.map((_, index) => ({ userEnteredValue: { formulaValue: `=${goalsRef}!A${index + 2}` } })),
  ]

  // 참가자 행: 이름 열(A)만 명단 참조 수식으로 채우고 점수 칸(B~)은 비운다("빈 점수").
  // player.id = 명단 데이터 행 위치 = 시트 행 − 1 이므로 명단 행은 A{id+1}(roster.ts:67).
  const participantRows = participants.map((participant) => ({
    values: [{ userEnteredValue: { formulaValue: `=${rosterRef}!A${participant.id + 1}` } }],
  }))

  // 단일 원자적 batchUpdate: addSheet(명시적 sheetId·헤더/이름열 고정) → 같은 배치의 updateCells가
  // 그 sheetId에 헤더+이름 수식을 기록. 실패 시 구글이 배치 전체를 롤백해 반쪽 탭이 남지 않는다.
  return [
    {
      addSheet: {
        properties: {
          sheetId,
          title: sessionDate,
          gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 },
        },
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [{ values: headerCells }, ...participantRows],
        fields: 'userEnteredValue',
      },
    },
  ]
}
