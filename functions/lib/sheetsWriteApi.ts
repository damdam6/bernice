// Sheets API 쓰기 래퍼 — values.update(단일 범위) + 429·5xx 재시도.
// 토큰 발급은 googleAuth.ts를 재사용하되 scope는 쓰기용으로 분리한다. 기존 sheetsApi.ts는
// 읽기 전용으로 그대로 두고 이 모듈은 그 파일을 수정하지 않는다.
// 회차 탭에서 대상 행 찾기·값 검증·API 엔드포인트는 이 모듈 범위 밖(#63 PRD §07) — 후속 이슈 몫.
//
// valueInputOption: 기본 RAW(점수 셀 — "1:15" 시각 자동해석 사고를 원천 차단, 읽기 쪽
// FORMATTED_VALUE와 왕복 일관). 참조 수식을 쓰는 경우(#66 add-players의 A열 이름 수식)만
// USER_ENTERED로 넘겨 "="로 시작하는 문자열이 리터럴이 아니라 살아있는 수식으로 저장되게 한다.

import { getAccessToken, type Env } from './googleAuth'
import { SheetsApiError } from './sheetsApi'

export type { Env }

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets'
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
// 지수적으로 벌어지는 간격, 총 대기 1.2초 이내 — 배열 길이가 곧 최대 재시도 횟수(2회).
const RETRY_DELAYS_MS = [300, 900]

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// range는 호출자가 이미 조립한 A1 표기 전체 문자열(예: "'2025-08-16'!B7:E7") — 탭 이름
// quoting은 sheetsApi.ts의 quoteSheetName을 호출자가 재사용하므로 이 모듈은 다시 구현하지 않는다.
// 대상이 항상 (행/셀) 전체 교체 update라 재시도가 멱등(PRD §07) — 429·5xx만 짧은 백오프로 최대 2회
// 재시도하고, 4xx는 재시도 없이 즉시 SheetsApiError로 실패시킨다.
export async function updateValues(
  env: Env,
  sheetId: string,
  range: string,
  values: string[][],
  valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW',
): Promise<void> {
  const accessToken = await getAccessToken(env, WRITE_SCOPE)
  const url = `${SHEETS_BASE_URL}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`
  const body = JSON.stringify({ range, majorDimension: 'ROWS', values })

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body,
    })
    if (response.ok) return

    const error = new SheetsApiError(
      `Sheets API 쓰기 실패 (${response.status}): ${await response.text()}`,
      response.status,
    )
    if (!isRetryableStatus(response.status) || attempt >= RETRY_DELAYS_MS.length) throw error
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}
