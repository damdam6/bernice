import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SheetRawBundle } from '../lib/sheetsApi'
import { RECORDS_CACHE_KEY, RECORDS_CACHE_TTL_SECONDS } from '../lib/records-cache'

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
      ['종목', '목표', '만점', '방향', '종료 회차'],
      ['골밑슛', '5', '10', '높을수록', ''],
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
  it('캐시 미스 시 200 응답 + 클라이언트는 no-store · 엣지 저장 사본만 max-age', async () => {
    fetchSheetBundleMock.mockResolvedValue(VALID_BUNDLE)
    const cache = makeFakeCache()
    const { context, flush } = makeContext(cache)

    const response = await onRequestGet(context)
    await flush()

    expect(response.status).toBe(200)
    // 브라우저가 /api/records를 자체 캐시하면 저장 직후 refetch가 네트워크에 닿지 못한다(#162).
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(cache.put).toHaveBeenCalledTimes(1)
    expect(cache.put.mock.calls[0][0].url).toBe(RECORDS_CACHE_KEY)
    // 저장 사본은 반대로 max-age를 유지해야 한다 — Cache API가 이 헤더로 TTL을 정한다.
    expect(cache.put.mock.calls[0][1].headers.get('Cache-Control')).toBe(
      `public, max-age=${RECORDS_CACHE_TTL_SECONDS}`,
    )

    const body = (await response.clone().json()) as { events: unknown }
    expect(body.events).toEqual([
      { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null, exemptable: false },
    ])
  })

  it('캐시 히트 시 fetchSheetBundle을 호출하지 않고, 응답은 no-store로 바꿔 돌려준다', async () => {
    fetchSheetBundleMock.mockResolvedValue(VALID_BUNDLE)
    const cache = makeFakeCache()
    const { context: firstContext, flush } = makeContext(cache)
    const missResponse = await onRequestGet(firstContext)
    const missBody = await missResponse.json()
    await flush()
    fetchSheetBundleMock.mockClear()

    const { context: secondContext } = makeContext(cache)
    const response = await onRequestGet(secondContext)

    expect(response.status).toBe(200)
    expect(fetchSheetBundleMock).not.toHaveBeenCalled()
    // 저장 사본에 박힌 max-age가 그대로 브라우저로 새어 나가면 안 된다(#162).
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    // 헤더 교체용 복제가 본문 스트림을 망가뜨리지 않는지 — 미스 응답과 같은 페이로드여야 한다.
    expect(await response.json()).toEqual(missBody)
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
