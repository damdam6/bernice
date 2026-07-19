import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// I/O 경계(메타/값 읽기·batchUpdate 쓰기)만 모킹하고 순수 로직(classify·parse·build)은 실물을 쓴다.
const { getSheetsMock, batchGetMock } = vi.hoisted(() => ({
  getSheetsMock: vi.fn(),
  batchGetMock: vi.fn(),
}))
vi.mock('../../lib/sheetsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sheetsApi')>()
  return { ...actual, getSpreadsheetSheets: getSheetsMock, batchGetValues: batchGetMock }
})

const { batchUpdateMock } = vi.hoisted(() => ({ batchUpdateMock: vi.fn() }))
vi.mock('../../lib/sheetsWriteApi', () => ({ batchUpdate: batchUpdateMock }))

const { onRequestPost } = await import('./create-sheet')
const { SheetsApiError } = await import('../../lib/sheetsApi')
const { RECORDS_CACHE_KEY } = await import('../../lib/records-cache')

const SHEETS = [
  { title: '버니스명단', sheetId: 0 },
  { title: '목표', sheetId: 11 },
  { title: '2025-05-16', sheetId: 22 },
]
const ROSTER_VALUES = [
  ['이름', '상태'],
  ['가은', '활동'], // id 1
  ['다현', '활동'], // id 2
  ['나래', '탈퇴'], // id 3 (비활동)
  ['라온', '활동'], // id 4
]
const GOALS_VALUES = [
  ['종목', '목표', '만점', '방향'],
  ['드리블셔틀런', '1:17', '', '낮을수록'],
  ['골밑슛', '5', '10', '높을수록'],
]

function makeContext(body: unknown, { raw = false }: { raw?: boolean } = {}) {
  const request = new Request('https://bernice.example/api/admin/create-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
  const cacheDelete = vi.fn(async (_request: Request) => true)
  vi.stubGlobal('caches', { default: { delete: cacheDelete } })

  const waitUntilPromises: Promise<unknown>[] = []
  const context = {
    request,
    env: { GOOGLE_SERVICE_ACCOUNT_KEY: '{}', SHEET_ID: 'sheet-under-test' },
    waitUntil: (p: Promise<unknown>) => {
      waitUntilPromises.push(p)
    },
  } as unknown as Parameters<typeof onRequestPost>[0]

  return { context, cacheDelete, flush: () => Promise.all(waitUntilPromises) }
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers()
  // 2025-08-16 12:00 KST → sessionDate '2025-08-16' (기존 탭과 겹치지 않음)
  vi.setSystemTime(new Date('2025-08-16T03:00:00Z'))
  getSheetsMock.mockResolvedValue(SHEETS)
  batchGetMock.mockResolvedValue([
    { range: "'버니스명단'", values: ROSTER_VALUES },
    { range: "'목표'", values: GOALS_VALUES },
  ])
  batchUpdateMock.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  getSheetsMock.mockReset()
  batchGetMock.mockReset()
  batchUpdateMock.mockReset()
})

describe('POST /api/admin/create-sheet', () => {
  it('201 — 참가자만·가나다·빈 점수 탭을 원자적 batchUpdate로 만들고 캐시를 무효화한다', async () => {
    const { context, cacheDelete, flush } = makeContext({ participantIds: [4, 1] }) // 라온, 가은

    const res = await onRequestPost(context)
    await flush()

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      sessionDate: '2025-08-16',
      participantCount: 2,
      participants: [
        { id: 1, name: '가은' },
        { id: 4, name: '라온' },
      ],
    })

    expect(batchUpdateMock).toHaveBeenCalledTimes(1)
    const [, sheetIdArg, requests] = batchUpdateMock.mock.calls[0] as [unknown, string, unknown[]]
    expect(sheetIdArg).toBe('sheet-under-test')
    const addSheet = (requests[0] as { addSheet: { properties: { title: string; sheetId: number } } }).addSheet
    expect(addSheet.properties.title).toBe('2025-08-16')
    expect(addSheet.properties.sheetId).toBe(23) // max(0,11,22)+1
    const rows = (requests[1] as { updateCells: { rows: { values: { userEnteredValue: unknown }[] }[] } }).updateCells
      .rows
    expect(rows[1].values[0]).toEqual({ userEnteredValue: { formulaValue: "='버니스명단'!A2" } }) // 가은 id1
    expect(rows[2].values[0]).toEqual({ userEnteredValue: { formulaValue: "='버니스명단'!A5" } }) // 라온 id4

    expect(cacheDelete).toHaveBeenCalledTimes(1)
    expect(cacheDelete.mock.calls[0][0].url).toBe(RECORDS_CACHE_KEY)
  })

  it('오늘 탭이 이미 있으면 409 sheet_already_exists — 값 조회·쓰기를 하지 않는다', async () => {
    vi.setSystemTime(new Date('2025-05-16T03:00:00Z')) // sessionDate '2025-05-16' = 기존 탭
    const { context } = makeContext({ participantIds: [1] })

    const res = await onRequestPost(context)

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'sheet_already_exists', sessionDate: '2025-05-16' })
    expect(batchGetMock).not.toHaveBeenCalled()
    expect(batchUpdateMock).not.toHaveBeenCalled()
  })

  it('비활동/미등록 id는 400 invalid_participants — 쓰기하지 않는다', async () => {
    const { context } = makeContext({ participantIds: [1, 3, 99] }) // 3=탈퇴, 99=없음

    const res = await onRequestPost(context)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'invalid_participants',
      message: expect.any(String),
      invalidIds: [3, 99],
    })
    expect(batchUpdateMock).not.toHaveBeenCalled()
  })

  it('참가자 0명이면 400 no_participants', async () => {
    const { context } = makeContext({ participantIds: [] })
    const res = await onRequestPost(context)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'no_participants' })
  })

  it('participantIds가 없거나 배열이 아니면 400 bad_request', async () => {
    for (const body of [{}, { participantIds: 'nope' }, { participantIds: [0] }, { participantIds: [1.5] }]) {
      const { context } = makeContext(body)
      const res = await onRequestPost(context)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((await jsonOf(res)).error).toBe('bad_request')
    }
  })

  it('비-JSON 바디는 400 bad_request', async () => {
    const { context } = makeContext('not json{', { raw: true })
    const res = await onRequestPost(context)
    expect(res.status).toBe(400)
    expect((await jsonOf(res)).error).toBe('bad_request')
  })

  it('명단 탭 누락은 500 missing_roster_tab', async () => {
    getSheetsMock.mockResolvedValue([{ title: '목표', sheetId: 11 }])
    const { context } = makeContext({ participantIds: [1] })
    const res = await onRequestPost(context)
    expect(res.status).toBe(500)
    expect((await jsonOf(res)).error).toBe('missing_roster_tab')
  })

  it('목표 탭 누락은 500 missing_goals_tab', async () => {
    getSheetsMock.mockResolvedValue([{ title: '버니스명단', sheetId: 0 }])
    const { context } = makeContext({ participantIds: [1] })
    const res = await onRequestPost(context)
    expect(res.status).toBe(500)
    expect((await jsonOf(res)).error).toBe('missing_goals_tab')
  })

  it('명단 헤더가 깨졌으면 500 sheet_data_invalid (파서 fail-loud)', async () => {
    batchGetMock.mockResolvedValue([
      { range: "'버니스명단'", values: [['잘못된헤더', '상태'], ['가은', '활동']] },
      { range: "'목표'", values: GOALS_VALUES },
    ])
    const { context } = makeContext({ participantIds: [1] })
    const res = await onRequestPost(context)
    expect(res.status).toBe(500)
    expect((await jsonOf(res)).error).toBe('sheet_data_invalid')
    expect(batchUpdateMock).not.toHaveBeenCalled()
  })

  it('Sheets API 실패(SheetsApiError)는 502로 매핑된다', async () => {
    getSheetsMock.mockRejectedValue(new SheetsApiError('Sheets API 호출 실패 (403): ...', 403))
    const { context } = makeContext({ participantIds: [1] })
    const res = await onRequestPost(context)
    expect(res.status).toBe(502)
    expect((await jsonOf(res)).error).toBe('sheets_api_error')
  })

  it('batchUpdate 쓰기 실패도 502로 매핑되고 성공 응답을 내지 않는다', async () => {
    batchUpdateMock.mockRejectedValue(new SheetsApiError('Sheets API batchUpdate 실패 (400): ...', 400))
    const { context } = makeContext({ participantIds: [1] })
    const res = await onRequestPost(context)
    expect(res.status).toBe(502)
    expect((await jsonOf(res)).error).toBe('sheets_api_error')
  })
})
