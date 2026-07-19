import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Env } from './googleAuth'
import { SheetsApiError } from './sheetsApi'
import { batchUpdate, updateValues } from './sheetsWriteApi'

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
  vi.useRealTimers()
})

function arrayBufferToPem(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const lines = btoa(binary).match(/.{1,64}/g) ?? []
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}

function decodeJwtPayload(assertion: string): { scope?: string } {
  const [, payloadB64] = assertion.split('.')
  const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return JSON.parse(new TextDecoder().decode(bytes))
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
const RANGE = "'2025-08-16'!B7:E7"
const VALUES = [['1:12', '6', '면제', '']]

interface StubResponse {
  status?: number
  body?: unknown
}

function toStubResponse(res: StubResponse): Response {
  return new Response(JSON.stringify(res.body ?? {}), {
    status: res.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// oauth2 토큰 발급은 항상 성공 고정 응답, PUT .../values/... 는 순서대로 소비하는 큐로 스텁한다
// (큐 소진 후에는 마지막 응답을 반복). scope가 고정 상수라 파일 내 테스트끼리 googleAuth의
// 모듈 전역 tokenCache를 공유해, 첫 테스트 이후로는 토큰 재발급 없이 캐시를 재사용한다.
function stubWriteFetch(putResponses: StubResponse[]) {
  const putCalls: { url: string; init: RequestInit & { body?: unknown } }[] = []
  const tokenAssertions: string[] = []

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit & { body?: unknown }) => {
    const url = String(input)

    if (url.includes('oauth2.googleapis.com/token')) {
      const params = new URLSearchParams(String(init?.body))
      tokenAssertions.push(params.get('assertion') ?? '')
      return toStubResponse({ body: { access_token: 'test-write-token', expires_in: 3600 } })
    }

    const res = putResponses[Math.min(putCalls.length, putResponses.length - 1)]
    putCalls.push({ url, init: init ?? {} })
    return toStubResponse(res)
  })

  vi.stubGlobal('fetch', fetchMock)
  return { putCalls, tokenAssertions }
}

describe('updateValues', () => {
  // 이 파일의 첫 테스트여야 한다 — tokenCache가 비어 있어 실제 토큰 발급(JWT 서명)이
  // 일어나는 유일한 지점이라, 쓰기 scope 클레임을 여기서만 안정적으로 검증할 수 있다.
  it('정상 응답이면 PUT 1회로 성공하고, 쓰기 scope·RAW·행 전체 바디로 요청한다', async () => {
    const { putCalls, tokenAssertions } = stubWriteFetch([{ status: 200, body: { updatedCells: 4 } }])

    await updateValues(makeEnv(), SHEET_ID, RANGE, VALUES)

    expect(putCalls).toHaveLength(1)
    const [{ url, init }] = putCalls
    expect(init.method).toBe('PUT')
    expect(url).toContain(encodeURIComponent(SHEET_ID))
    expect(url).toContain(encodeURIComponent(RANGE))
    expect(url).toContain('valueInputOption=RAW')
    expect(JSON.parse(String(init.body))).toEqual({ range: RANGE, majorDimension: 'ROWS', values: VALUES })

    const payload = decodeJwtPayload(tokenAssertions[0])
    expect(payload.scope).toBe('https://www.googleapis.com/auth/spreadsheets')
  })

  it('429 1회 후 성공하면 재시도로 복구된다', async () => {
    vi.useFakeTimers()
    const { putCalls } = stubWriteFetch([
      { status: 429, body: { error: 'rate_limited' } },
      { status: 200, body: {} },
    ])

    const promise = updateValues(makeEnv(), SHEET_ID, RANGE, VALUES)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBeUndefined()
    expect(putCalls).toHaveLength(2)
  })

  it('500이 재시도 상한(2회)까지 발생해도 마지막에 성공하면 복구된다', async () => {
    vi.useFakeTimers()
    const { putCalls } = stubWriteFetch([
      { status: 500, body: { error: 'internal' } },
      { status: 500, body: { error: 'internal' } },
      { status: 200, body: {} },
    ])

    const promise = updateValues(makeEnv(), SHEET_ID, RANGE, VALUES)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBeUndefined()
    expect(putCalls).toHaveLength(3)
  })

  it('500이 재시도 소진(3회 연속)되면 SheetsApiError로 실패한다', async () => {
    vi.useFakeTimers()
    const { putCalls } = stubWriteFetch([
      { status: 500, body: { error: 'internal' } },
      { status: 500, body: { error: 'internal' } },
      { status: 500, body: { error: 'internal' } },
    ])

    const promise = updateValues(makeEnv(), SHEET_ID, RANGE, VALUES)
    // rejects 핸들러를 타이머 진행 전에 먼저 붙여야 한다 — runAllTimersAsync 도중 reject되므로
    // 나중에 붙이면 그 사이 unhandled rejection 경고가 뜬다.
    const assertion = expect(promise).rejects.toMatchObject({ status: 500 })
    await vi.runAllTimersAsync()

    await assertion
    expect(putCalls).toHaveLength(3)
  })

  it('4xx는 재시도 없이 즉시 SheetsApiError로 실패한다', async () => {
    const { putCalls } = stubWriteFetch([{ status: 400, body: { error: 'validation_failed' } }])

    await expect(updateValues(makeEnv(), SHEET_ID, RANGE, VALUES)).rejects.toThrow(SheetsApiError)
    await expect(updateValues(makeEnv(), SHEET_ID, RANGE, VALUES)).rejects.toMatchObject({ status: 400 })
    expect(putCalls).toHaveLength(2) // 호출마다 재시도 없이 1회씩만 — 총 2회
  })

  it('sheetId·range에 경로 구분자 등 특수문자가 있어도 인코딩해 요청 경로를 벗어나지 않는다', async () => {
    const maliciousSheetId = 'evil/../x?y=1'
    const maliciousRange = "'2025-08-16'!B7:E7&foo=bar"
    const { putCalls } = stubWriteFetch([{ status: 200, body: {} }])

    await updateValues(makeEnv(), maliciousSheetId, maliciousRange, VALUES)

    const [{ url }] = putCalls
    expect(url).toContain(encodeURIComponent(maliciousSheetId))
    expect(url).toContain(encodeURIComponent(maliciousRange))
    expect(url).not.toContain(maliciousSheetId)
  })
})

const REQUESTS = [
  { addSheet: { properties: { sheetId: 23, title: '2025-08-16' } } },
  { updateCells: { start: { sheetId: 23, rowIndex: 0, columnIndex: 0 }, rows: [], fields: 'userEnteredValue' } },
]

describe('batchUpdate', () => {
  it('정상 응답이면 POST :batchUpdate 1회로 성공하고 requests 바디를 담아 파싱 결과를 반환한다', async () => {
    const { putCalls } = stubWriteFetch([{ status: 200, body: { replies: [{ addSheet: {} }] } }])

    const result = await batchUpdate(makeEnv(), SHEET_ID, REQUESTS)

    expect(putCalls).toHaveLength(1)
    const [{ url, init }] = putCalls
    expect(init.method).toBe('POST')
    expect(url).toContain(`${encodeURIComponent(SHEET_ID)}:batchUpdate`)
    expect(JSON.parse(String(init.body))).toEqual({ requests: REQUESTS })
    expect(result).toEqual({ replies: [{ addSheet: {} }] })
  })

  it('429 1회 후 성공하면 재시도로 복구된다', async () => {
    vi.useFakeTimers()
    const { putCalls } = stubWriteFetch([
      { status: 429, body: { error: 'rate_limited' } },
      { status: 200, body: {} },
    ])

    const promise = batchUpdate(makeEnv(), SHEET_ID, REQUESTS)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual({})
    expect(putCalls).toHaveLength(2)
  })

  it('4xx(예: 이미 존재하는 탭)는 재시도 없이 즉시 SheetsApiError로 실패한다', async () => {
    const { putCalls } = stubWriteFetch([{ status: 400, body: { error: 'already exists' } }])

    await expect(batchUpdate(makeEnv(), SHEET_ID, REQUESTS)).rejects.toMatchObject({ status: 400 })
    expect(putCalls).toHaveLength(1)
  })

  it('5xx가 재시도 소진(3회 연속)되면 SheetsApiError로 실패한다', async () => {
    vi.useFakeTimers()
    const { putCalls } = stubWriteFetch([
      { status: 500, body: { error: 'internal' } },
      { status: 500, body: { error: 'internal' } },
      { status: 500, body: { error: 'internal' } },
    ])

    const promise = batchUpdate(makeEnv(), SHEET_ID, REQUESTS)
    const assertion = expect(promise).rejects.toMatchObject({ status: 500 })
    await vi.runAllTimersAsync()

    await assertion
    expect(putCalls).toHaveLength(3)
  })
})
