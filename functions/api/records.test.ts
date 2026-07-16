import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SheetRawBundle } from '../lib/sheetsApi'
import { RECORDS_CACHE_KEY } from '../lib/records-cache'

const { fetchSheetBundleMock } = vi.hoisted(() => ({ fetchSheetBundleMock: vi.fn() }))

vi.mock('../lib/sheetsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sheetsApi')>()
  return { ...actual, fetchSheetBundle: fetchSheetBundleMock }
})

const { onRequestGet } = await import('./records')
const { SheetsApiError } = await import('../lib/sheetsApi')

const VALID_BUNDLE: SheetRawBundle = {
  roster: {
    name: '버니스명단',
    values: [
      ['이름', '상태'],
      ['철수', '활동'],
    ],
  },
  goals: {
    name: '목표',
    values: [
      ['종목', '목표', '만점', '방향'],
      ['골밑슛', '5', '10', '높을수록'],
    ],
  },
  rounds: [],
  unclassified: [],
}

function makeFakeCache() {
  const store = new Map<string, Response>()
  return {
    match: vi.fn(async (request: Request) => {
      const stored = store.get(request.url)
      return stored ? stored.clone() : undefined
    }),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    }),
  }
}

function makeContext(cache: ReturnType<typeof makeFakeCache>) {
  const waitUntilPromises: Promise<unknown>[] = []
  const context = {
    env: { GOOGLE_SERVICE_ACCOUNT_KEY: '{}', SHEET_ID: 'sheet-under-test' },
    waitUntil: (p: Promise<unknown>) => {
      waitUntilPromises.push(p)
    },
    // 나머지 PagesFunction context 필드는 이 핸들러가 쓰지 않음
  } as unknown as Parameters<typeof onRequestGet>[0]

  vi.stubGlobal('caches', { default: cache })

  return { context, flush: () => Promise.all(waitUntilPromises) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchSheetBundleMock.mockReset()
})

describe('onRequestGet /api/records', () => {
  it('캐시 미스 시 200 응답 + Cache-Control 헤더 + 캐시에 저장', async () => {
    fetchSheetBundleMock.mockResolvedValue(VALID_BUNDLE)
    const cache = makeFakeCache()
    const { context, flush } = makeContext(cache)

    const response = await onRequestGet(context)
    await flush()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toMatch(/max-age=\d+/)
    expect(cache.put).toHaveBeenCalledTimes(1)
    expect(cache.put.mock.calls[0][0].url).toBe(RECORDS_CACHE_KEY)

    const body = (await response.clone().json()) as { events: unknown }
    expect(body.events).toEqual([
      { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
    ])
  })

  it('캐시 히트 시 fetchSheetBundle을 호출하지 않는다', async () => {
    fetchSheetBundleMock.mockResolvedValue(VALID_BUNDLE)
    const cache = makeFakeCache()
    const { context: firstContext, flush } = makeContext(cache)
    await onRequestGet(firstContext)
    await flush()
    fetchSheetBundleMock.mockClear()

    const { context: secondContext } = makeContext(cache)
    const response = await onRequestGet(secondContext)

    expect(response.status).toBe(200)
    expect(fetchSheetBundleMock).not.toHaveBeenCalled()
  })

  it('SheetsApiError는 502로 매핑된다', async () => {
    fetchSheetBundleMock.mockRejectedValue(new SheetsApiError('Sheets API 호출 실패 (401): ...', 401))
    const { context } = makeContext(makeFakeCache())

    const response = await onRequestGet(context)

    expect(response.status).toBe(502)
    const body = (await response.json()) as { error: unknown }
    expect(body.error).toBe('sheets_api_error')
  })

  it('명단 탭 누락은 500 + missing_roster_tab으로 매핑된다', async () => {
    fetchSheetBundleMock.mockResolvedValue({ ...VALID_BUNDLE, roster: null })
    const { context } = makeContext(makeFakeCache())

    const response = await onRequestGet(context)

    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: unknown }
    expect(body.error).toBe('missing_roster_tab')
  })

  it('파서 실패(예: 헤더 불일치)는 500 + sheet_data_invalid로 매핑된다', async () => {
    fetchSheetBundleMock.mockResolvedValue({
      ...VALID_BUNDLE,
      roster: { name: '버니스명단', values: [['잘못된헤더', '상태'], ['철수', '활동']] },
    })
    const { context } = makeContext(makeFakeCache())

    const response = await onRequestGet(context)

    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: unknown }
    expect(body.error).toBe('sheet_data_invalid')
  })
})
