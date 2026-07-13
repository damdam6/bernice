import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getAccessToken, type Env } from './googleAuth'

let pem: string
let publicKey: CryptoKey
let scopeCounter = 0

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  publicKey = keyPair.publicKey
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

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// 매 테스트마다 고유 scope를 써서 모듈 전역 tokenCache가 테스트 간에 섞이지 않게 한다.
function uniqueScope(): string {
  scopeCounter++
  return `https://example.com/scope-${scopeCounter}`
}

function makeEnv(overrides: Partial<{ client_email: string; private_key: string }> = {}): Env {
  return {
    GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify({
      client_email: 'bernice-test@example-project.iam.gserviceaccount.com',
      private_key: pem,
      ...overrides,
    }),
  }
}

interface MockResponse {
  status?: number
  body: unknown
}

// oauth2.googleapis.com/token 호출을 순서대로 응답하는 fetch 스텁. 마지막 응답은 이후 호출에도 반복 사용.
function stubTokenEndpoint(responses: MockResponse[]) {
  const assertions: string[] = []
  const fetchMock = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input)
    if (!url.includes('oauth2.googleapis.com/token')) throw new Error(`예상치 못한 fetch 대상: ${url}`)

    const params = new URLSearchParams(String(init?.body))
    assertions.push(params.get('assertion') ?? '')

    const res = responses[Math.min(assertions.length - 1, responses.length - 1)]
    return new Response(JSON.stringify(res.body), {
      status: res.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { callCount: () => fetchMock.mock.calls.length, assertions }
}

describe('getAccessToken', () => {
  it('실제 서명 가능한 JWT를 만들어 액세스 토큰을 발급받는다', async () => {
    const scope = uniqueScope()
    const { assertions } = stubTokenEndpoint([{ body: { access_token: 'token-1', expires_in: 3600 } }])

    const token = await getAccessToken(makeEnv(), scope)
    expect(token).toBe('token-1')

    const [headerB64, payloadB64, sigB64] = assertions[0].split('.')
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)))
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(payload.iss).toBe('bernice-test@example-project.iam.gserviceaccount.com')
    expect(payload.scope).toBe(scope)
    expect(payload.aud).toBe('https://oauth2.googleapis.com/token')
    expect(payload.exp - payload.iat).toBe(3600)

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      base64UrlDecode(sigB64),
      signingInput,
    )
    expect(valid).toBe(true)
  })

  it('같은 scope로 연속 호출하면 재발급하지 않는다', async () => {
    const scope = uniqueScope()
    const mock = stubTokenEndpoint([{ body: { access_token: 'token-a', expires_in: 3600 } }])

    expect(await getAccessToken(makeEnv(), scope)).toBe('token-a')
    expect(await getAccessToken(makeEnv(), scope)).toBe('token-a')
    expect(mock.callCount()).toBe(1)
  })

  it('scope가 다르면 별도로 발급한다', async () => {
    const scopeA = uniqueScope()
    const scopeB = uniqueScope()
    const mock = stubTokenEndpoint([
      { body: { access_token: 'token-a', expires_in: 3600 } },
      { body: { access_token: 'token-b', expires_in: 3600 } },
    ])

    expect(await getAccessToken(makeEnv(), scopeA)).toBe('token-a')
    expect(await getAccessToken(makeEnv(), scopeB)).toBe('token-b')
    expect(mock.callCount()).toBe(2)
  })

  it('캐시가 없는 상태에서 동시 호출해도 발급은 1회만 일어난다', async () => {
    const scope = uniqueScope()
    const mock = stubTokenEndpoint([{ body: { access_token: 'token-concurrent', expires_in: 3600 } }])

    const results = await Promise.all([
      getAccessToken(makeEnv(), scope),
      getAccessToken(makeEnv(), scope),
      getAccessToken(makeEnv(), scope),
    ])

    expect(results).toEqual(['token-concurrent', 'token-concurrent', 'token-concurrent'])
    expect(mock.callCount()).toBe(1)
  })

  it('캐시가 만료된 상태에서 동시 호출해도 재발급은 1회만 일어난다 (레이스 회귀 테스트)', async () => {
    const scope = uniqueScope()
    const mock = stubTokenEndpoint([
      { body: { access_token: 'seed', expires_in: 0 } }, // 여유분(margin)을 감안해도 즉시 만료
      { body: { access_token: 'refreshed', expires_in: 3600 } },
    ])

    expect(await getAccessToken(makeEnv(), scope)).toBe('seed')
    expect(mock.callCount()).toBe(1)

    const results = await Promise.all([
      getAccessToken(makeEnv(), scope),
      getAccessToken(makeEnv(), scope),
      getAccessToken(makeEnv(), scope),
    ])

    expect(results).toEqual(['refreshed', 'refreshed', 'refreshed'])
    expect(mock.callCount()).toBe(2)
  })

  it('발급 실패(비정상 응답) 시 캐시에 남기지 않고, 다음 호출은 재시도해 성공할 수 있다', async () => {
    const scope = uniqueScope()
    const mock = stubTokenEndpoint([
      { status: 500, body: { error: 'internal_error' } },
      { body: { access_token: 'recovered', expires_in: 3600 } },
    ])

    await expect(getAccessToken(makeEnv(), scope)).rejects.toThrow('구글 액세스 토큰 발급 실패')
    expect(await getAccessToken(makeEnv(), scope)).toBe('recovered')
    expect(mock.callCount()).toBe(2)
  })

  it('private_key의 개행이 리터럴 \\n으로 이중 이스케이프돼도 정상적으로 서명한다', async () => {
    const scope = uniqueScope()
    stubTokenEndpoint([{ body: { access_token: 'token-escaped', expires_in: 3600 } }])

    const doubleEscapedPem = pem.replace(/\n/g, '\\n')
    const token = await getAccessToken(makeEnv({ private_key: doubleEscapedPem }), scope)
    expect(token).toBe('token-escaped')
  })

  it('GOOGLE_SERVICE_ACCOUNT_KEY가 없으면 명확한 에러', async () => {
    await expect(
      getAccessToken({ GOOGLE_SERVICE_ACCOUNT_KEY: '' }, uniqueScope()),
    ).rejects.toThrow('GOOGLE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다')
  })

  it('GOOGLE_SERVICE_ACCOUNT_KEY가 올바른 JSON이 아니면 명확한 에러', async () => {
    await expect(
      getAccessToken({ GOOGLE_SERVICE_ACCOUNT_KEY: '{not-json' }, uniqueScope()),
    ).rejects.toThrow('올바른 JSON이 아닙니다')
  })

  it('GOOGLE_SERVICE_ACCOUNT_KEY가 JSON이지만 객체가 아니면(null) 명확한 에러', async () => {
    await expect(
      getAccessToken({ GOOGLE_SERVICE_ACCOUNT_KEY: 'null' }, uniqueScope()),
    ).rejects.toThrow('JSON 객체가 아닙니다')
  })

  it('client_email/private_key가 없으면 명확한 에러', async () => {
    await expect(
      getAccessToken(
        { GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify({ client_email: 'x@example.com' }) },
        uniqueScope(),
      ),
    ).rejects.toThrow('client_email/private_key가 없습니다')
  })

  it('구글 응답에 access_token이 없으면 명확한 에러', async () => {
    stubTokenEndpoint([{ body: { expires_in: 3600 } }])
    await expect(getAccessToken(makeEnv(), uniqueScope())).rejects.toThrow('access_token이 없습니다')
  })

  it('구글 응답에 expires_in이 없으면 명확한 에러', async () => {
    stubTokenEndpoint([{ body: { access_token: 'x' } }])
    await expect(getAccessToken(makeEnv(), uniqueScope())).rejects.toThrow('expires_in이 없습니다')
  })
})
