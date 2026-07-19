// POST /api/admin/records — 관리자가 입력 화면에서 저장한 한 선수의 회차 점수 전체를 회차 탭
// 해당 행에 기록한다(행 단위 upsert, 마지막 저장 승리). PRD: docs/prd-record-input.html §06~§09.
//
// 인증(401/403)은 _middleware.ts(#42)가 /api/admin/* 전체에서 담당한다 — 여기 도달한 요청은 이미
// admin 세션. 이 핸들러는 200/400/404×2/502(+무결성 폴백 500)만 구현한다.
//
// 파이프라인: 바디 형식 검증(400) → fetchSheetBundle 읽기 → 목표/명단 파싱·playerId 해석 →
// scores key 집합 검증(400) → 회차 탭 존재(404 session_not_found) → 헤더 매핑·대상 행 찾기
// (404 not_participant / 500) → 값 검증(400·시트 미기록) → updateValues(RAW·502) →
// RECORDS_CACHE_KEY 무효화(응답 전 await, PRD §09) → 정규화 결과(EventScore) 200.
//
// 판정 순서 = 요청 형식(400) → 자원 존재(404) → 값 유효성(400) → 쓰기(502). 검증·헤더 매핑·
// 이름 매칭 규칙은 새로 만들지 않고 기존 순수 함수를 재사용한다(PRD §08).

import { SheetsApiError, fetchSheetBundle, type Env as SheetsEnv } from '../../lib/sheetsApi'
import { updateValues } from '../../lib/sheetsWriteApi'
import { parseGoals } from '../../lib/parse-goals'
import { parseRoster } from '../../lib/roster'
import { isValidRoundTabName } from '../../lib/sheetTabs'
import { RECORDS_CACHE_KEY } from '../../lib/records-cache'
import {
  SheetIntegrityError,
  buildWritePlan,
  evaluateScores,
  locateParticipantRow,
  mapHeaderToEvents,
  validateScoreKeys,
} from '../../lib/record-write'

interface Env extends SheetsEnv {
  SHEET_ID: string
}

interface RecordsRequest {
  sessionDate: string
  playerId: number
  scores: Record<string, string>
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // 1. 바디 파싱 + 형식 검증 — Sheets 호출 전 fail-fast.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return validationFailed('JSON 바디가 필요합니다.')
  }
  const parsed = parseBody(raw)
  if (!parsed.ok) return validationFailed(parsed.message)
  const { sessionDate, playerId, scores } = parsed.value

  // 2. 날짜 형식 검증 — 형식 오류(400)와 회차 탭 없음(404 session_not_found)을 구분한다.
  if (!isValidRoundTabName(sessionDate)) {
    return validationFailed(`sessionDate 형식이 올바르지 않습니다 (YYYY-MM-DD): "${sessionDate}"`)
  }

  try {
    // 3. 읽기 — GET 경로와 동일한 fetchSheetBundle 재사용(명단·목표·회차 탭).
    const bundle = await fetchSheetBundle(env, env.SHEET_ID)
    const rosterTable = bundle.roster
    const goalsTable = bundle.goals
    if (rosterTable === null) return sheetDataInvalid('버니스명단 탭을 찾을 수 없습니다.')
    if (goalsTable === null) return sheetDataInvalid('목표 탭을 찾을 수 없습니다.')

    // 파싱 중 나는 Error는 시트 무결성 문제다 — integrity()로 표식해 sheet_data_invalid로,
    // 그 외 예기치 못한 오류는 internal_error로 구분한다.
    const { players } = integrity(() => parseRoster(rosterTable.values))
    const events = integrity(() => parseGoals(goalsTable.values))

    // 4. playerId → 명단 선수(이름) 해석. id는 명단 행 위치라 결번 가능 — 값으로 조회.
    const player = players.find((candidate) => candidate.id === playerId)
    if (!player) return validationFailed(`존재하지 않는 선수 ID입니다: ${playerId}`)

    // 5. scores key 집합 == events (누락·미지 → 400).
    const keyCheck = validateScoreKeys(scores, events)
    if (keyCheck.missing.length > 0 || keyCheck.unknown.length > 0) {
      return validationFailed('점수 종목 key가 목표 종목과 일치하지 않습니다.', {
        missing: keyCheck.missing,
        unknown: keyCheck.unknown,
      })
    }

    // 6. 회차 탭 존재 (404 session_not_found). round.name은 원본 탭 이름(날짜)이라 A1 참조에 그대로 재사용.
    const round = bundle.rounds.find((candidate) => candidate.name === sessionDate)
    if (!round) {
      return Response.json(
        { error: 'session_not_found', message: `회차 탭(${sessionDate})을 찾을 수 없습니다.` },
        { status: 404 },
      )
    }
    if (round.values.length === 0) {
      return sheetDataInvalid(`회차 탭(${sessionDate})이 비어 있습니다 (헤더 행조차 없음).`)
    }

    // 7. 헤더 매핑(열 순서 가정 없음) + 대상 행 찾기. 헤더 이상·동명 중복은 throw → 500.
    const eventColumns = integrity(() => mapHeaderToEvents(round.values[0], events))
    const location = locateParticipantRow(round.values, player.name)
    if (location.kind === 'not_participant') {
      return Response.json(
        { error: 'not_participant', message: `${player.name} 선수는 ${sessionDate} 회차 참가자가 아닙니다.` },
        { status: 404 },
      )
    }

    // 8. 값 검증 — invalid·valueKind 불일치면 400 후 즉시 반환(시트에 쓰지 않는다).
    const { scoreMap, invalid } = evaluateScores(scores, events)
    if (invalid.length > 0) {
      return validationFailed('점수 값이 올바르지 않습니다.', { invalid })
    }

    // 9. 쓰기 — 점수 셀 범위만 values.update(RAW). 이름 열·헤더에는 쓰지 않는다.
    const plan = buildWritePlan(round.name, location.rowNumber, eventColumns, scores)
    await updateValues(env, env.SHEET_ID, plan.range, plan.values)

    // 10. 캐시 무효화 — 응답 전 await (waitUntil이면 저장 직후 refetch가 옛 캐시를 받을 수 있다, PRD §09).
    // Cache.delete는 URL 문자열을 직접 받는다 — GET 경로가 put한 같은 키(RECORDS_CACHE_KEY)에 매칭된다.
    await caches.default.delete(RECORDS_CACHE_KEY)

    return Response.json({ sessionDate, playerId, name: player.name, scores: scoreMap })
  } catch (err) {
    return errorResponse(err)
  }
}

type ParsedBody = { ok: true; value: RecordsRequest } | { ok: false; message: string }

// 타입 가드 — 검증 후 `as` 단언 없이 Record<string, unknown>로 좁힌다(배열·null은 객체에서 제외).
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseBody(raw: unknown): ParsedBody {
  if (!isPlainObject(raw)) {
    return { ok: false, message: '요청 바디가 객체가 아닙니다.' }
  }
  const body = raw

  if (typeof body.sessionDate !== 'string' || body.sessionDate === '') {
    return { ok: false, message: 'sessionDate(문자열)가 필요합니다.' }
  }
  if (typeof body.playerId !== 'number' || !Number.isInteger(body.playerId) || body.playerId < 1) {
    return { ok: false, message: 'playerId(1 이상의 정수)가 필요합니다.' }
  }
  if (!isPlainObject(body.scores)) {
    return { ok: false, message: 'scores(객체)가 필요합니다.' }
  }

  const scores: Record<string, string> = {}
  for (const [key, value] of Object.entries(body.scores)) {
    if (typeof value !== 'string') {
      return { ok: false, message: `scores["${key}"] 값이 문자열이 아닙니다.` }
    }
    scores[key] = value
  }
  if (Object.keys(scores).length === 0) {
    return { ok: false, message: 'scores가 비어 있습니다.' }
  }

  return { ok: true, value: { sessionDate: body.sessionDate, playerId: body.playerId, scores } }
}

function validationFailed(message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: 'validation_failed', message, ...extra }, { status: 400 })
}

// 시트 무결성 문제(헤더 깨짐·탭 누락·동명 중복 등) — GET 경로의 파서 Error → 500 sheet_data_invalid와 일관.
function sheetDataInvalid(message: string): Response {
  return Response.json({ error: 'sheet_data_invalid', message }, { status: 500 })
}

// 알려진 무결성 지점(파싱·헤더 매핑)의 Error만 SheetIntegrityError로 승격한다 — 그 밖의 예기치
// 못한 Error(코드 버그·런타임 예외)는 그대로 흘려보내 errorResponse가 internal_error로 분리한다.
function integrity<T>(run: () => T): T {
  try {
    return run()
  } catch (err) {
    if (err instanceof SheetsApiError || err instanceof SheetIntegrityError) throw err
    if (err instanceof Error) throw new SheetIntegrityError(err.message)
    throw err
  }
}

function errorResponse(err: unknown): Response {
  if (err instanceof SheetsApiError) {
    return Response.json(
      { error: 'sheets_api_error', message: err.message, upstreamStatus: err.status },
      { status: 502 },
    )
  }
  // 명확한 무결성 오류만 sheet_data_invalid로, 그 외 예기치 못한 오류는 internal_error로 분리한다.
  if (err instanceof SheetIntegrityError) return sheetDataInvalid(err.message)
  // 예기치 못한 오류(코드 버그·런타임 예외)의 내부 메시지는 클라이언트에 노출하지 않고 서버 로그로만 남긴다.
  console.error('POST /api/admin/records 처리 중 예기치 못한 오류:', err)
  return Response.json({ error: 'internal_error', message: '서버 오류가 발생했습니다.' }, { status: 500 })
}
