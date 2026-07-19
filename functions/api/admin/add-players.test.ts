import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ValueRange } from '../../lib/sheetsApi'
import { RECORDS_CACHE_KEY } from '../../lib/records-cache'

const { getTabTitlesMock, batchGetMock, updateValuesMock } = vi.hoisted(() => ({
  getTabTitlesMock: vi.fn(),
  batchGetMock: vi.fn(),
  updateValuesMock: vi.fn(),
}))

// I/O 경계만 목킹 — classifySheetTabs·parseRoster·buildAddPlayersPlan·quoteSheetName은 실제 로직.
vi.mock('../../lib/sheetsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sheetsApi')>()
  return { ...actual, getSpreadsheetTabTitles: getTabTitlesMock, batchGetValues: batchGetMock }
})
vi.mock('../../lib/sheetsWriteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sheetsWriteApi')>()
  return { ...actual, updateValues: updateValuesMock }
})

const { onRequestPost } = await import('./add-players')
const { SheetsApiError } = await import('../../lib/sheetsApi')

const TITLES = ['버니스명단', '목표', '2025-08-16']
const ROSTER_VALUES = [
  ['이름', '상태'],
  ['선수1', '활동'],
  ['선수2', '활동'],
  ['선수3', '활동'],
  ['선수4', '탈퇴'],
  ['선수5', '활동'],
]
// 선수1이 이미 그 회차에 있음 (2행)
const ROUND_VALUES = [
  ['이름', '골밑슛'],
  ['선수1', '5'],
]

function stubReads(rosterValues = ROSTER_VALUES, roundValues = ROUND_VALUES, titles = TITLES) {
  getTabTitlesMock.mockResolvedValue(titles)
  const ranges: ValueRange[] = [
    { range: 'roster', values: rosterValues },
    { range: 'round', values: roundValues },
  ]
  batchGetMock.mockResolvedValue(ranges)
}

function makeFakeCache() {
  const deleted: string[] = []
  return {
    delete: vi.fn(async (request: Request) => {
      deleted.push(request.url)
      return true
    }),
    deleted,
  }
}

function makeContext(body: unknown, cache = makeFakeCache()) {
  vi.stubGlobal('caches', { default: cache })
  const request = new Request('https://example.test/api/admin/add-players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const context = {
    env: { GOOGLE_SERVICE_ACCOUNT_KEY: '{}', SHEET_ID: 'sheet-under-test' },
    request,
  } as unknown as Parameters<typeof onRequestPost>[0]
  return { context, cache }
}

afterEach(() => {
  vi.unstubAllGlobals()
  getTabTitlesMock.mockReset()
  batchGetMock.mockReset()
  updateValuesMock.mockReset()
})

describe('onRequestPost /api/admin/add-players', () => {
  it('활동 선수를 맨 아래에 추가하고 200 + 캐시 무효화한다', async () => {
    stubReads()
    const { context, cache } = makeContext({ sessionDate: '2025-08-16', playerIds: [3, 2] })

    const response = await onRequestPost(context)

    expect(response.status).toBe(200)
    const body = (await response.json()) as { sessionDate: string; added: unknown }
    expect(body.sessionDate).toBe('2025-08-16')
    expect(body.added).toEqual([
      { playerId: 2, name: '선수2' },
      { playerId: 3, name: '선수3' },
    ])

    // 선수1이 2행이므로 3행부터, A열 이름 참조 수식, USER_ENTERED
    expect(updateValuesMock).toHaveBeenCalledTimes(1)
    const [, sheetId, range, values, valueInputOption] = updateValuesMock.mock.calls[0]
    expect(sheetId).toBe('sheet-under-test')
    expect(range).toBe("'2025-08-16'!A3:A4")
    expect(values).toEqual([["='버니스명단'!A3"], ["='버니스명단'!A4"]])
    expect(valueInputOption).toBe('USER_ENTERED')

    expect(cache.deleted).toEqual([RECORDS_CACHE_KEY])
  })

  it('이미 참가한 선수가 섞이면 409 + 아무것도 쓰지 않는다', async () => {
    stubReads()
    const { context, cache } = makeContext({ sessionDate: '2025-08-16', playerIds: [1, 2] })

    const response = await onRequestPost(context)

    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: string; conflictPlayerIds: number[] }
    expect(body.error).toBe('already_participant')
    expect(body.conflictPlayerIds).toEqual([1])
    expect(updateValuesMock).not.toHaveBeenCalled()
    expect(cache.deleted).toEqual([])
  })

  it('비활동(탈퇴) 선수는 400 validation_failed', async () => {
    stubReads()
    const { context } = makeContext({ sessionDate: '2025-08-16', playerIds: [4] })

    const response = await onRequestPost(context)

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('validation_failed')
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('없는 날짜는 404 session_not_found', async () => {
    stubReads()
    const { context } = makeContext({ sessionDate: '2099-01-01', playerIds: [2] })

    const response = await onRequestPost(context)

    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toBe('session_not_found')
    expect(batchGetMock).not.toHaveBeenCalled()
  })

  it('날짜 형식 오류는 400 validation_failed (조회 전 차단)', async () => {
    const { context } = makeContext({ sessionDate: '8/16', playerIds: [2] })

    const response = await onRequestPost(context)

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('validation_failed')
    expect(getTabTitlesMock).not.toHaveBeenCalled()
  })

  it('playerIds가 배열이 아니면 400 validation_failed', async () => {
    const { context } = makeContext({ sessionDate: '2025-08-16', playerIds: 2 })

    const response = await onRequestPost(context)

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('validation_failed')
  })

  it('비-JSON 바디는 400 bad_request', async () => {
    const { context } = makeContext('not json')

    const response = await onRequestPost(context)

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe('bad_request')
  })

  it('Sheets API 실패는 502 sheets_api_error로 매핑된다', async () => {
    getTabTitlesMock.mockRejectedValue(new SheetsApiError('Sheets API 호출 실패 (503): ...', 503))
    const { context } = makeContext({ sessionDate: '2025-08-16', playerIds: [2] })

    const response = await onRequestPost(context)

    expect(response.status).toBe(502)
    const body = (await response.json()) as { error: string; upstreamStatus: number }
    expect(body.error).toBe('sheets_api_error')
    expect(body.upstreamStatus).toBe(503)
  })

  it('명단 탭 누락은 500 missing_roster_tab', async () => {
    stubReads(ROSTER_VALUES, ROUND_VALUES, ['목표', '2025-08-16'])
    const { context } = makeContext({ sessionDate: '2025-08-16', playerIds: [2] })

    const response = await onRequestPost(context)

    expect(response.status).toBe(500)
    expect(((await response.json()) as { error: string }).error).toBe('missing_roster_tab')
  })
})
