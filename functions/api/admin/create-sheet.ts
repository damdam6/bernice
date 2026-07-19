// POST /api/admin/create-sheet — 오늘(KST) 회차 탭을 "참가자만·가나다·빈 점수" 포맷으로 만든다(P5).
// 인증(admin)은 _middleware.ts(#42)가 담당하므로 여기 도달한 요청은 이미 admin 세션이다. 검증·정렬·
// batchUpdate 조립은 create-sheet.ts(순수)에 있고, 이 파일은 읽기 → 빌더 → 원자적 쓰기 → 캐시 무효화
// 오케스트레이션과 에러 계약 매핑만 담당한다(에러 매핑은 records.ts 스타일).
//
// 요청 바디: { participantIds: number[] } — 프론트 모달(#67)이 "활동만·가나다·기본 해제"로 고른 선수 id.
// 이름이 아니라 id로 받는 이유는 프론트가 이미 /api/records에서 id를 쥐고 있고 이름은 개명될 수 있어서다
// (docs/prd-record-input.html §06과 동일 원칙) — 서버가 명단에서 활동 여부·이름을 다시 확인한다.

import {
  type Env as SheetsEnv,
  SheetsApiError,
  batchGetValues,
  getSpreadsheetSheets,
  quoteSheetName,
} from '../../lib/sheetsApi'
import { batchUpdate } from '../../lib/sheetsWriteApi'
import { classifySheetTabs } from '../../lib/sheetTabs'
import { parseRoster } from '../../lib/roster'
import { parseGoals } from '../../lib/parse-goals'
import { type BuildCreateSheetResult, buildCreateSheetPlan } from '../../lib/create-sheet'
import { formatSeoulDate } from '../../lib/seoul-date'
import { RECORDS_CACHE_KEY } from '../../lib/records-cache'

interface Env extends SheetsEnv {
  SHEET_ID: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  let participantIds: number[]
  try {
    const body = (await request.json()) as { participantIds?: unknown } | null
    participantIds = parseParticipantIds(body?.participantIds)
  } catch {
    return Response.json(
      { error: 'bad_request', message: '참가자 목록(participantIds: number[])이 담긴 JSON 바디가 필요합니다.' },
      { status: 400 },
    )
  }

  const sessionDate = formatSeoulDate(new Date())

  try {
    const sheets = await getSpreadsheetSheets(env, env.SHEET_ID)

    // 중복 가드는 명단/목표 값 조회·쓰기보다 먼저 — 오늘 탭이 이미 있으면 아무 것도 읽지/쓰지 않고 409.
    if (sheets.some((sheet) => sheet.title.normalize('NFC') === sessionDate)) {
      return Response.json(
        { error: 'sheet_already_exists', message: `오늘(${sessionDate}) 회차 탭이 이미 있습니다.`, sessionDate },
        { status: 409 },
      )
    }

    const classification = classifySheetTabs(sheets.map((sheet) => sheet.title))
    if (classification.roster === null) {
      return Response.json({ error: 'missing_roster_tab', message: '버니스명단 탭을 찾을 수 없습니다.' }, { status: 500 })
    }
    if (classification.goals === null) {
      return Response.json({ error: 'missing_goals_tab', message: '목표 탭을 찾을 수 없습니다.' }, { status: 500 })
    }

    const [rosterRange, goalsRange] = await batchGetValues(env, env.SHEET_ID, [
      quoteSheetName(classification.roster),
      quoteSheetName(classification.goals),
    ])
    const { players } = parseRoster(rosterRange.values)
    const events = parseGoals(goalsRange.values)

    const plan = buildCreateSheetPlan({
      sessionDate,
      existingSheetIds: sheets.map((sheet) => sheet.sheetId),
      rosterName: classification.roster,
      goalsName: classification.goals,
      events,
      players,
      participantIds,
    })
    if (!plan.ok) return planError(plan)

    // 원자적 batchUpdate(addSheet + updateCells) — 실패 시 반쪽 탭이 남지 않는다.
    // 사전 중복 가드가 정상 경로의 409를 담당하지만, 가드~쓰기 사이에 다른 관리자가 같은 탭을 만들었다면
    // addSheet가 "이미 존재" 4xx로 실패한다(→ 502). 배치가 원자적이라 그 경우에도 반쪽 탭은 없다.
    await batchUpdate(env, env.SHEET_ID, plan.requests)

    // 새 회차 탭(빈 점수여도)이 /api/records 응답에 새 세션으로 반영되므로 캐시를 비운다.
    // 응답을 막지 않도록 waitUntil로 넘긴다(records.ts의 cache.put와 동일 패턴).
    context.waitUntil(caches.default.delete(new Request(RECORDS_CACHE_KEY)))

    return Response.json(
      { sessionDate: plan.sessionDate, participantCount: plan.participants.length, participants: plan.participants },
      { status: 201 },
    )
  } catch (err) {
    return errorResponse(err)
  }
}

// participantIds는 양의 정수 배열이어야 한다 — 명단 id는 1부터 시작한다(roster.ts). 배열이 아니거나
// 정수 아닌 값이 섞이면 throw해 위 catch가 400 bad_request로 매핑한다(비-JSON 바디와 동일 취급).
function parseParticipantIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) throw new Error('participantIds must be an array')
  return raw.map((value) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new Error('participantIds must be positive integers')
    }
    return value
  })
}

function planError(plan: Extract<BuildCreateSheetResult, { ok: false }>): Response {
  if (plan.code === 'no_participants') {
    return Response.json({ error: 'no_participants', message: '참가자를 한 명 이상 선택해야 합니다.' }, { status: 400 })
  }
  return Response.json(
    { error: 'invalid_participants', message: '활동 중인 명단 선수가 아닌 참가자가 있습니다.', invalidIds: plan.invalidIds },
    { status: 400 },
  )
}

function errorResponse(err: unknown): Response {
  if (err instanceof SheetsApiError) {
    return Response.json(
      { error: 'sheets_api_error', message: err.message, upstreamStatus: err.status },
      { status: 502 },
    )
  }
  if (err instanceof Error) {
    // parseRoster/parseGoals의 fail-loud(헤더 불일치 등) — records.ts와 동일하게 500 sheet_data_invalid.
    return Response.json({ error: 'sheet_data_invalid', message: err.message }, { status: 500 })
  }
  return Response.json({ error: 'internal_error', message: '알 수 없는 오류' }, { status: 500 })
}
