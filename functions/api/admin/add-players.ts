// POST /api/admin/add-players (#66) — 기존 회차 탭에 활동 선수를 맨 아래 추가한다.
// 인증은 _middleware.ts(#42)가 /api/admin/* 에서 admin 세션을 강제한다 — 여기 도달한 요청은 이미
// 관리자. 이 핸들러는 I/O 오케스트레이션만: 탭 조회 → 순수 검증/조립(add-players.ts) → A열 수식
// 쓰기(USER_ENTERED) → records 캐시 무효화. 검증 규칙·수식 조립은 buildAddPlayersPlan이 소유한다.
//
// 쓰기 방식(PRD §07): 회차 탭은 append-only라 "마지막 비공백 행 다음"으로 계산한 범위에 update
// 1건이면 되고 재시도가 멱등하다. A열 이름 참조 수식은 RAW로 쓰면 리터럴이 되므로 USER_ENTERED.

import { isPlainObject } from '../../../shared/is-plain-object'
import type { Env as SheetsEnv } from '../../lib/sheetsApi'
import {
  SheetsApiError,
  batchGetValues,
  getSpreadsheetTabTitles,
  quoteSheetName,
} from '../../lib/sheetsApi'
import { classifySheetTabs } from '../../lib/sheetTabs'
import { parseRoster } from '../../lib/roster'
import { updateValues } from '../../lib/sheetsWriteApi'
import { AddPlayersError, buildAddPlayersPlan } from '../../lib/add-players'
import { RECORDS_CACHE_KEY } from '../../lib/records-cache'

interface Env extends SheetsEnv {
  SHEET_ID: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // 바디 파싱은 admin/records.ts와 같은 관용구(#93) — as 단언 없이 unknown에서 좁힌다.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'bad_request', message: 'JSON 바디가 필요합니다.' }, { status: 400 })
  }
  const body: Record<string, unknown> = isPlainObject(raw) ? raw : {}
  const sessionDate = body.sessionDate
  const playerIds = body.playerIds

  // 형태 검증은 여기서(값 검증은 buildAddPlayersPlan). 날짜 형식 오류는 PRD 계약대로 400.
  if (typeof sessionDate !== 'string' || !DATE_PATTERN.test(sessionDate)) {
    return validationFailed('sessionDate는 YYYY-MM-DD 형식이어야 합니다.')
  }
  if (!Array.isArray(playerIds) || !playerIds.every((id) => typeof id === 'number')) {
    return validationFailed('playerIds는 숫자 배열이어야 합니다.')
  }

  try {
    const titles = await getSpreadsheetTabTitles(env, env.SHEET_ID)
    const classification = classifySheetTabs(titles)
    if (classification.roster === null) {
      return Response.json(
        { error: 'missing_roster_tab', message: '버니스명단 탭을 찾을 수 없습니다.' },
        { status: 500 },
      )
    }

    const round = classification.rounds.find((tab) => tab.name.normalize('NFC') === sessionDate)
    if (!round) {
      return Response.json(
        { error: 'session_not_found', message: `회차 탭(${sessionDate})을 찾을 수 없습니다.` },
        { status: 404 },
      )
    }

    // 명단 + 대상 회차 탭을 1회 batchGet — 순서(명단, 회차)가 반환 인덱스와 일치.
    const [rosterRange, roundRange] = await batchGetValues(env, env.SHEET_ID, [
      quoteSheetName(classification.roster),
      quoteSheetName(round.name),
    ])
    const { players } = parseRoster(rosterRange.values)

    const plan = buildAddPlayersPlan({
      rosterName: classification.roster,
      players,
      roundValues: roundRange.values,
      playerIds,
    })

    const endRow = plan.startRow + plan.rows.length - 1
    const range = `${quoteSheetName(round.name)}!A${plan.startRow}:A${endRow}`
    await updateValues(env, env.SHEET_ID, range, plan.rows, 'USER_ENTERED')

    // 쓰기 성공 → 다음 /api/records 조회가 미스→재조립되도록 같은 키를 삭제(records-cache.ts).
    await caches.default.delete(new Request(RECORDS_CACHE_KEY))

    return Response.json({ sessionDate: round.name, added: plan.added })
  } catch (err) {
    return errorResponse(err)
  }
}

function validationFailed(message: string): Response {
  return Response.json({ error: 'validation_failed', message }, { status: 400 })
}

function errorResponse(err: unknown): Response {
  if (err instanceof AddPlayersError) {
    if (err.code === 'already_participant') {
      return Response.json(
        { error: err.code, message: err.message, conflictPlayerIds: err.conflictPlayerIds ?? [] },
        { status: 409 },
      )
    }
    return Response.json({ error: err.code, message: err.message }, { status: 400 })
  }
  if (err instanceof SheetsApiError) {
    return Response.json(
      { error: 'sheets_api_error', message: err.message, upstreamStatus: err.status },
      { status: 502 },
    )
  }
  // parseRoster 등 파서 실패(헤더 불일치 등)는 기존 /api/records와 같은 형태로 500.
  if (err instanceof Error) {
    return Response.json({ error: 'sheet_data_invalid', message: err.message }, { status: 500 })
  }
  return Response.json({ error: 'internal_error', message: '알 수 없는 오류' }, { status: 500 })
}
