// Sheets API 읽기 래퍼 — 메타(탭 목록) 조회 + values.batchGet 일괄 조회.
// 토큰 발급은 googleAuth.ts(이슈 #19), 탭 분류는 sheetTabs.ts(이슈 #18)를 그대로 재사용한다.
// 이 모듈은 파싱하지 않고 원시 string[][]만 돌려준다 — 파서는 후속 이슈(#25~#27) 담당.

import { getAccessToken, type Env } from './googleAuth'
import { classifySheetTabs } from './sheetTabs'

export type { Env }

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets'
// 읽기 전용 — 쓰기가 필요한 관리자 기능(P5)은 별도 scope로 자체 처리한다.
const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

export class SheetsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'SheetsApiError'
  }
}

// 401(만료/폐기 토큰)·429(레이트리밋)도 재시도 없이 그대로 SheetsApiError로 전파한다.
// googleAuth의 scope별 캐시는 만료 5분 전 선제 갱신하지만 캐시 무효화 API가 없어, 서비스계정
// 키 회전/폐기 시 워커 warm isolate에 남은 캐시된 토큰이 만료 시각까지(최대 ~55분) 401을
// 반복시킬 수 있다 — googleAuth.ts 변경이 필요해 이 이슈 범위 밖으로 의도적으로 남겨둔다.
async function callSheetsApi(env: Env, sheetId: string, pathSuffix: string): Promise<unknown> {
  const accessToken = await getAccessToken(env, READONLY_SCOPE)
  const response = await fetch(`${SHEETS_BASE_URL}/${encodeURIComponent(sheetId)}${pathSuffix}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new SheetsApiError(`Sheets API 호출 실패 (${response.status}): ${await response.text()}`, response.status)
  }

  return response.json()
}

interface SpreadsheetMetadata {
  sheets?: { properties?: { title?: string } }[]
}

export async function getSpreadsheetTabTitles(env: Env, sheetId: string): Promise<string[]> {
  const metadata = (await callSheetsApi(env, sheetId, '?fields=sheets.properties.title')) as SpreadsheetMetadata

  return (metadata.sheets ?? []).map((sheet) => {
    const title = sheet.properties?.title
    if (typeof title !== 'string') {
      throw new Error('Sheets API 메타 응답에 탭 title이 없습니다.')
    }
    return title
  })
}

export interface SheetMeta {
  title: string
  /** 안정 식별자 — 탭 이름과 별개. 회차 탭 생성(P5)이 새 탭에 부여할 빈 sheetId 선정에 쓴다. */
  sheetId: number
}

interface SpreadsheetMetadataWithIds {
  sheets?: { properties?: { title?: string; sheetId?: number } }[]
}

// getSpreadsheetTabTitles와 달리 sheetId까지 함께 가져온다 — create-sheet가 addSheet에 명시적
// sheetId(기존과 겹치지 않는 값)를 부여해 같은 batchUpdate 배치에서 forward-reference하기 위함.
// 첫 탭의 sheetId는 보통 0이라 typeof === 'number'로 검사(0을 누락으로 오판하지 않음).
export async function getSpreadsheetSheets(env: Env, sheetId: string): Promise<SheetMeta[]> {
  const metadata = (await callSheetsApi(
    env,
    sheetId,
    '?fields=sheets.properties(sheetId,title)',
  )) as SpreadsheetMetadataWithIds

  return (metadata.sheets ?? []).map((sheet) => {
    const title = sheet.properties?.title
    const id = sheet.properties?.sheetId
    if (typeof title !== 'string') {
      throw new Error('Sheets API 메타 응답에 탭 title이 없습니다.')
    }
    if (typeof id !== 'number') {
      throw new Error('Sheets API 메타 응답에 탭 sheetId가 없습니다.')
    }
    return { title, sheetId: id }
  })
}

export interface ValueRange {
  range: string
  values: string[][]
}

interface BatchGetResponse {
  valueRanges?: { values?: unknown }[]
}

export async function batchGetValues(env: Env, sheetId: string, ranges: string[]): Promise<ValueRange[]> {
  if (ranges.length === 0) return []

  const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join('&')
  // valueRenderOption을 명시하지 않고 기본값(FORMATTED_VALUE)에 의존한다 — 이 옵션에서는 셀 값이
  // 항상 문자열로 내려와 normalizeScore/normalizeStatus(이슈 #20)의 string 입력 계약과 맞는다.
  const body = (await callSheetsApi(env, sheetId, `/values:batchGet?${query}`)) as BatchGetResponse
  const valueRanges = body.valueRanges ?? []

  // 구글 API는 응답 valueRanges 순서가 요청 ranges 순서와 동일함을 보장한다 — 인덱스로 매핑.
  return ranges.map((range, index) => ({
    range,
    values: Array.isArray(valueRanges[index]?.values) ? (valueRanges[index].values as string[][]) : [],
  }))
}

// fetchSheetBundle의 유일한 호출 경로에서는 분류된 탭 이름(고정 리터럴 또는 YYYY-MM-DD)만
// 넘어와 작은따옴표를 포함할 수 없다 — 이스케이프 분기는 현재 도달 불가능한 방어 코드지만,
// A1 표기 규칙상 필요한 처리라 export해 단위 테스트로 직접 검증한다.
export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

export interface SheetRawTable {
  name: string
  values: string[][]
}

export interface RoundRawTable extends SheetRawTable {
  date: Date
}

export interface SheetRawBundle {
  roster: SheetRawTable | null
  goals: SheetRawTable | null
  /** 날짜 오름차순 — classifySheetTabs와 동일 순서 */
  rounds: RoundRawTable[]
  unclassified: string[]
}

export async function fetchSheetBundle(env: Env, sheetId: string): Promise<SheetRawBundle> {
  const tabTitles = await getSpreadsheetTabTitles(env, sheetId)
  const classification = classifySheetTabs(tabTitles)

  const names = [
    ...(classification.roster !== null ? [classification.roster] : []),
    ...(classification.goals !== null ? [classification.goals] : []),
    ...classification.rounds.map((round) => round.name),
  ]
  const valueRanges = await batchGetValues(
    env,
    sheetId,
    names.map((name) => quoteSheetName(name)),
  )

  let cursor = 0
  const roster =
    classification.roster !== null ? { name: classification.roster, values: valueRanges[cursor++].values } : null
  const goals =
    classification.goals !== null ? { name: classification.goals, values: valueRanges[cursor++].values } : null
  const rounds = classification.rounds.map((round) => ({
    name: round.name,
    date: round.date,
    values: valueRanges[cursor++].values,
  }))

  return { roster, goals, rounds, unclassified: classification.unclassified }
}
