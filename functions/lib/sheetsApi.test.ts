import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Env } from './googleAuth'
import {
  SheetsApiError,
  batchGetValues,
  fetchSheetBundle,
  getSpreadsheetTabTitles,
  quoteSheetName,
} from './sheetsApi'

let pem: string

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  pem = arrayBufferToPem((await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)) as ArrayBuffer)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function arrayBufferToPem(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const lines = btoa(binary).match(/.{1,64}/g) ?? []
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}

function makeEnv(): Env {
  return {
    GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify({
      client_email: 'bernice-test@example-project.iam.gserviceaccount.com',
      private_key: pem,
    }),
  }
}

const SHEET_ID = 'sheet-under-test'

interface StubResponse {
  status?: number
  body?: unknown
  /** JSON.stringify(body) 대신 그대로 응답 본문으로 쓴다 — 빈 문자열·비-JSON 본문 테스트용. */
  rawBody?: string
}

interface SheetsStub {
  metadata?: StubResponse
  batchGet?: StubResponse
}

function toStubResponse(res: StubResponse): Response {
  const bodyText = res.rawBody !== undefined ? res.rawBody : JSON.stringify(res.body)
  return new Response(bodyText, {
    status: res.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// oauth2 토큰 발급과 sheets.googleapis.com 메타/batchGet 호출을 함께 스텁한다. scope가 고정 상수라
// 파일 내 테스트끼리 googleAuth의 모듈 전역 tokenCache를 공유하므로, 토큰 엔드포인트는 매번 유효한
// 응답을 주도록 해 실제 호출 여부(캐시 히트 여부)와 무관하게 테스트가 통과하게 한다.
function stubSheetsFetch(stub: SheetsStub) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input)
    calls.push(url)

    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = url.includes('/values:batchGet')
      ? (stub.batchGet ?? { body: { valueRanges: [] } })
      : (stub.metadata ?? { body: { sheets: [] } })

    return toStubResponse(res)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

describe('getSpreadsheetTabTitles', () => {
  it('탭 이름을 시트 순서 그대로 반환한다', async () => {
    const { calls } = stubSheetsFetch({
      metadata: {
        body: {
          sheets: [
            { properties: { title: '버니스명단' } },
            { properties: { title: '목표' } },
            { properties: { title: '2025-05-16' } },
          ],
        },
      },
    })

    const titles = await getSpreadsheetTabTitles(makeEnv(), SHEET_ID)
    expect(titles).toEqual(['버니스명단', '목표', '2025-05-16'])

    const metaCall = calls.find((url) => url.includes(SHEET_ID) && !url.includes('oauth2'))
    expect(metaCall).toContain('fields=sheets.properties.title')
  })

  it('sheetId에 경로 구분자 등 특수문자가 있어도 인코딩해 요청 경로를 벗어나지 않는다', async () => {
    const maliciousSheetId = 'evil/../x?y=1'
    const { calls } = stubSheetsFetch({ metadata: { body: { sheets: [] } } })

    await getSpreadsheetTabTitles(makeEnv(), maliciousSheetId)

    const metaCall = calls.find((url) => !url.includes('oauth2'))
    expect(metaCall).toContain(encodeURIComponent(maliciousSheetId))
    expect(metaCall).not.toContain(maliciousSheetId)
  })

  it('title이 없는 시트가 섞여 있으면 명확한 에러', async () => {
    stubSheetsFetch({ metadata: { body: { sheets: [{ properties: {} }] } } })
    await expect(getSpreadsheetTabTitles(makeEnv(), SHEET_ID)).rejects.toThrow('탭 title이 없습니다')
  })

  it('401 응답도 SheetsApiError(status 포함)로 전파한다', async () => {
    stubSheetsFetch({ metadata: { status: 401, body: { error: 'unauthorized' } } })
    await expect(getSpreadsheetTabTitles(makeEnv(), SHEET_ID)).rejects.toMatchObject({ status: 401 })
  })

  it('4xx 응답을 SheetsApiError(status 포함)로 전파한다', async () => {
    stubSheetsFetch({ metadata: { status: 403, body: { error: 'permission denied' } } })

    await expect(getSpreadsheetTabTitles(makeEnv(), SHEET_ID)).rejects.toThrow(SheetsApiError)
    await expect(getSpreadsheetTabTitles(makeEnv(), SHEET_ID)).rejects.toMatchObject({ status: 403 })
  })

  it('5xx 응답도 SheetsApiError(status 포함)로 전파한다', async () => {
    stubSheetsFetch({ metadata: { status: 500, body: { error: 'internal' } } })
    await expect(getSpreadsheetTabTitles(makeEnv(), SHEET_ID)).rejects.toMatchObject({ status: 500 })
  })

  it('에러 응답 본문이 비어있거나 JSON이 아니어도 안전하게 에러 메시지에 담는다', async () => {
    stubSheetsFetch({ metadata: { status: 500, rawBody: '' } })
    await expect(getSpreadsheetTabTitles(makeEnv(), SHEET_ID)).rejects.toThrow('Sheets API 호출 실패 (500)')

    stubSheetsFetch({ metadata: { status: 502, rawBody: '<html>Bad Gateway</html>' } })
    await expect(getSpreadsheetTabTitles(makeEnv(), SHEET_ID)).rejects.toMatchObject({ status: 502 })
  })
})

describe('batchGetValues', () => {
  it('range가 비어있으면 API를 호출하지 않고 빈 배열을 반환한다', async () => {
    const { calls } = stubSheetsFetch({})
    const result = await batchGetValues(makeEnv(), SHEET_ID, [])
    expect(result).toEqual([])
    expect(calls).toEqual([])
  })

  it('요청 순서대로 값을 매핑하고, 빈 탭은 []로 정규화한다', async () => {
    stubSheetsFetch({
      batchGet: {
        body: {
          valueRanges: [
            { values: [['이름', '상태'], ['선수1', '활동']] },
            {}, // 빈 탭 — values 필드 자체가 없음
          ],
        },
      },
    })

    const result = await batchGetValues(makeEnv(), SHEET_ID, ["'버니스명단'", "'목표'"])
    expect(result).toEqual([
      { range: "'버니스명단'", values: [['이름', '상태'], ['선수1', '활동']] },
      { range: "'목표'", values: [] },
    ])
  })

  it('요청한 range 문자열이 쿼리에 그대로 인코딩되어 전달된다 (하이픈 포함 탭 이름 quoting)', async () => {
    const { calls } = stubSheetsFetch({ batchGet: { body: { valueRanges: [{ values: [] }] } } })
    await batchGetValues(makeEnv(), SHEET_ID, ["'2025-05-16'"])

    const sheetsCall = calls.find((url) => url.includes('/values:batchGet'))
    expect(sheetsCall).toContain(`ranges=${encodeURIComponent("'2025-05-16'")}`)
  })

  it('valueRenderOption을 명시하지 않고 기본값(FORMATTED_VALUE)에 의존한다', async () => {
    const { calls } = stubSheetsFetch({ batchGet: { body: { valueRanges: [{ values: [] }] } } })
    await batchGetValues(makeEnv(), SHEET_ID, ["'목표'"])

    const sheetsCall = calls.find((url) => url.includes('/values:batchGet'))
    expect(sheetsCall).not.toContain('valueRenderOption')
  })

  it('4xx/5xx 응답을 SheetsApiError로 구분해 전파한다', async () => {
    stubSheetsFetch({ batchGet: { status: 404, body: { error: 'range not found' } } })
    await expect(batchGetValues(makeEnv(), SHEET_ID, ["'없는탭'"])).rejects.toMatchObject({ status: 404 })
  })

  it('응답 valueRanges가 요청 range 수보다 적으면 초과분을 []로 정규화한다', async () => {
    stubSheetsFetch({ batchGet: { body: { valueRanges: [{ values: [['a']] }] } } })

    const result = await batchGetValues(makeEnv(), SHEET_ID, ["'첫번째'", "'두번째'"])
    expect(result).toEqual([
      { range: "'첫번째'", values: [['a']] },
      { range: "'두번째'", values: [] },
    ])
  })
})

describe('quoteSheetName', () => {
  it('탭 이름을 작은따옴표로 감싸고, 내부 작은따옴표는 이중화해 이스케이프한다', () => {
    expect(quoteSheetName('2025-05-16')).toBe("'2025-05-16'")
    expect(quoteSheetName("선수5'B")).toBe("'선수5''B'")
  })
})

describe('fetchSheetBundle', () => {
  it('명단/목표/회차를 분류해 원시 값 묶음으로 반환한다', async () => {
    stubSheetsFetch({
      metadata: {
        body: {
          sheets: [
            { properties: { title: '버니스명단' } },
            { properties: { title: '목표' } },
            { properties: { title: '2025-05-16' } },
            { properties: { title: 'Sheet1' } },
          ],
        },
      },
      batchGet: {
        body: {
          valueRanges: [
            { values: [['이름', '상태'], ['선수1', '활동']] },
            { values: [['종목', '목표', '만점', '방향'], ['드리블셔틀런', '1:17', '', '낮을수록']] },
            { values: [['이름', '드리블셔틀런'], ['선수1', '1:12']] },
          ],
        },
      },
    })

    const bundle = await fetchSheetBundle(makeEnv(), SHEET_ID)

    expect(bundle.roster).toEqual({ name: '버니스명단', values: [['이름', '상태'], ['선수1', '활동']] })
    expect(bundle.goals).toEqual({
      name: '목표',
      values: [['종목', '목표', '만점', '방향'], ['드리블셔틀런', '1:17', '', '낮을수록']],
    })
    expect(bundle.rounds).toEqual([
      { name: '2025-05-16', date: new Date(Date.UTC(2025, 4, 16)), values: [['이름', '드리블셔틀런'], ['선수1', '1:12']] },
    ])
    expect(bundle.unclassified).toEqual(['Sheet1'])
  })

  it('명단/목표 탭이 없으면 해당 range를 요청하지 않고 null을 반환한다', async () => {
    const { calls } = stubSheetsFetch({
      metadata: { body: { sheets: [{ properties: { title: '2025-05-16' } }] } },
      batchGet: { body: { valueRanges: [{ values: [['이름'], ['선수1']] }] } },
    })

    const bundle = await fetchSheetBundle(makeEnv(), SHEET_ID)

    expect(bundle.roster).toBeNull()
    expect(bundle.goals).toBeNull()
    expect(bundle.rounds).toEqual([
      { name: '2025-05-16', date: new Date(Date.UTC(2025, 4, 16)), values: [['이름'], ['선수1']] },
    ])

    const batchGetCall = calls.find((url) => url.includes('/values:batchGet'))
    expect(batchGetCall).toContain(`ranges=${encodeURIComponent("'2025-05-16'")}`)
    expect((batchGetCall?.match(/ranges=/g) ?? []).length).toBe(1)
  })

  it('roster/goals/rounds 어느 것도 없으면 batchGet 자체를 호출하지 않는다', async () => {
    const { calls } = stubSheetsFetch({
      metadata: { body: { sheets: [{ properties: { title: 'Sheet1' } }] } },
    })

    const bundle = await fetchSheetBundle(makeEnv(), SHEET_ID)

    expect(bundle).toEqual({ roster: null, goals: null, rounds: [], unclassified: ['Sheet1'] })
    expect(calls.some((url) => url.includes('/values:batchGet'))).toBe(false)
  })

  it('메타 조회 단계의 4xx/5xx 오류도 SheetsApiError로 전파한다', async () => {
    stubSheetsFetch({ metadata: { status: 403, body: { error: 'permission denied' } } })
    await expect(fetchSheetBundle(makeEnv(), SHEET_ID)).rejects.toMatchObject({ status: 403 })
  })

  it('NFD(자모 분해) 명단 탭 이름도 원본 그대로 quoting해 batchGet에 요청한다', async () => {
    const rosterNfd = '버니스명단'.normalize('NFD')
    expect(rosterNfd).not.toBe('버니스명단') // 픽스처가 실제로 다른 바이트 표현인지 확인

    const { calls } = stubSheetsFetch({
      metadata: { body: { sheets: [{ properties: { title: rosterNfd } }] } },
      batchGet: { body: { valueRanges: [{ values: [['이름', '상태']] }] } },
    })

    const bundle = await fetchSheetBundle(makeEnv(), SHEET_ID)
    expect(bundle.roster?.name).toBe(rosterNfd)

    const batchGetCall = calls.find((url) => url.includes('/values:batchGet'))
    expect(batchGetCall).toContain(`ranges=${encodeURIComponent(`'${rosterNfd}'`)}`)
  })
})
