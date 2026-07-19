// Sheets API 쓰기 래퍼 — values.update(단일 범위, valueInputOption=RAW) + 429·5xx 재시도.
// 토큰 발급은 googleAuth.ts를 재사용하되 scope는 쓰기용으로 분리한다. 기존 sheetsApi.ts는
// 읽기 전용으로 그대로 두고 이 모듈은 그 파일을 수정하지 않는다.
// 회차 탭에서 대상 행 찾기·값 검증·API 엔드포인트는 이 모듈 범위 밖(#63 PRD §07) — 후속 이슈 몫.

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

// fetch + 429·5xx 짧은 백오프 재시도 공통 루프 — 성공 응답을 반환하고, 4xx나 재시도 소진 시
// SheetsApiError로 던진다. updateValues·batchUpdate가 공유한다(errorLabel로 실패 메시지만 구분).
async function fetchWithRetry(url: string, init: RequestInit, errorLabel: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init)
    if (response.ok) return response

    const error = new SheetsApiError(`${errorLabel} (${response.status}): ${await response.text()}`, response.status)
    if (!isRetryableStatus(response.status) || attempt >= RETRY_DELAYS_MS.length) throw error
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}

// range는 호출자가 이미 조립한 A1 표기 전체 문자열(예: "'2025-08-16'!B7:E7") — 탭 이름
// quoting은 sheetsApi.ts의 quoteSheetName을 호출자가 재사용하므로 이 모듈은 다시 구현하지 않는다.
// 대상이 항상 행 전체 교체 update라 재시도가 멱등(PRD §07) — 429·5xx만 짧은 백오프로 최대 2회
// 재시도하고, 4xx는 재시도 없이 즉시 SheetsApiError로 실패시킨다.
export async function updateValues(env: Env, sheetId: string, range: string, values: string[][]): Promise<void> {
  const accessToken = await getAccessToken(env, WRITE_SCOPE)
  const url = `${SHEETS_BASE_URL}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
  const body = JSON.stringify({ range, majorDimension: 'ROWS', values })

  await fetchWithRetry(
    url,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body,
    },
    'Sheets API 쓰기 실패',
  )
}

// spreadsheets.batchUpdate — 여러 구조 변경 요청(addSheet·updateCells 등)을 한 번에 원자적으로
// 적용한다. 실패 시 구글이 배치 전체를 롤백해 부분 적용이 없다 → 회차 탭 생성(P5)에서 반쪽 탭이
// 남지 않는다. requests는 호출자(create-sheet)가 조립한 Sheets API request 객체 배열.
// updateValues와 같은 429·5xx 재시도를 쓴다 — addSheet는 엄밀히 멱등은 아니지만(5xx 응답만 실패하고
// 실제로는 적용됐다면 재시도가 "이미 존재" 4xx로 실패) 사전 중복 가드가 그 위험을 줄이고, 흔한 5xx는
// 배치가 통째로 거부된 경우라 재시도가 안전하다.
export async function batchUpdate(env: Env, sheetId: string, requests: unknown[]): Promise<unknown> {
  const accessToken = await getAccessToken(env, WRITE_SCOPE)
  const url = `${SHEETS_BASE_URL}/${encodeURIComponent(sheetId)}:batchUpdate`

  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    },
    'Sheets API batchUpdate 실패',
  )
  return response.json()
}
