import { describe, expect, it } from 'vitest'
import { verifySessionToken } from '../lib/session-cookie'
import { onRequestPost } from './login'

const TEAM_PASSCODE = 'team-passcode-1234'
const ADMIN_CODE = 'admin-code-5678'
const SESSION_SECRET = 'test-session-secret'

// KVNamespace 중 rate limiting이 쓰는 get/put/delete만 흉내 낸 in-memory 모의(#80).
function makeKV() {
  const store = new Map<string, string>()
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
    async delete(key: string) {
      store.delete(key)
    },
  }
}

type LoginEnv = {
  TEAM_PASSCODE?: string
  ADMIN_CODE?: string
  SESSION_SECRET: string
  LOGIN_RATE_LIMIT?: ReturnType<typeof makeKV>
}

function makeContext(
  body: unknown,
  {
    env = { TEAM_PASSCODE, ADMIN_CODE, SESSION_SECRET },
    url = 'https://bernice.example/api/login',
    raw,
    ip,
  }: { env?: LoginEnv; url?: string; raw?: string; ip?: string } = {},
) {
  const request = new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ip !== undefined ? { 'CF-Connecting-IP': ip } : {}),
    },
    body: raw !== undefined ? raw : JSON.stringify(body),
  })
  // 이 핸들러는 request·env만 쓴다 — 나머지 PagesFunction context 필드는 생략.
  return { request, env } as unknown as Parameters<typeof onRequestPost>[0]
}

// Set-Cookie의 첫 name=value 쌍에서 토큰 값을 뽑는다(없으면 null).
function cookieToken(response: Response): string | null {
  const setCookie = response.headers.get('Set-Cookie')
  if (!setCookie) return null
  const pair = setCookie.split(';')[0]
  return pair.slice(pair.indexOf('=') + 1)
}

describe('POST /api/login', () => {
  it('팀 패스코드 → 200 + role=team 세션 쿠키', async () => {
    const res = await onRequestPost(makeContext({ code: TEAM_PASSCODE }))

    expect(res.status).toBe(200)
    expect(await res.clone().json()).toEqual({ ok: true, role: 'team' })

    const token = cookieToken(res)
    expect(token).toBeTruthy()
    expect(await verifySessionToken(token, SESSION_SECRET)).toMatchObject({ role: 'team' })
  })

  it('관리자 코드 → 200 + role=admin 세션 쿠키', async () => {
    const res = await onRequestPost(makeContext({ code: ADMIN_CODE }))

    expect(res.status).toBe(200)
    expect(await res.clone().json()).toEqual({ ok: true, role: 'admin' })
    expect(await verifySessionToken(cookieToken(res), SESSION_SECRET)).toMatchObject({
      role: 'admin',
    })
  })

  it('틀린 코드 → 401, Set-Cookie 없음', async () => {
    const res = await onRequestPost(makeContext({ code: 'wrong-code' }))

    expect(res.status).toBe(401)
    expect(res.headers.get('Set-Cookie')).toBeNull()
    expect(await res.json()).toMatchObject({ error: 'invalid_passcode' })
  })

  it('빈 코드·code 누락·비문자열 → 401, Set-Cookie 없음', async () => {
    for (const body of [{ code: '' }, {}, { code: 123 }, { code: null }]) {
      const res = await onRequestPost(makeContext(body))
      expect(res.status, `body: ${JSON.stringify(body)}`).toBe(401)
      expect(res.headers.get('Set-Cookie')).toBeNull()
    }
  })

  it('설정값이 비어 있으면 어떤 입력도 통과하지 않는다(우회 없음)', async () => {
    const env: LoginEnv = { TEAM_PASSCODE: '', ADMIN_CODE: '', SESSION_SECRET }
    for (const code of ['', 'x', 'change-me']) {
      const res = await onRequestPost(makeContext({ code }, { env }))
      expect(res.status, `code: ${JSON.stringify(code)}`).toBe(401)
      expect(res.headers.get('Set-Cookie')).toBeNull()
    }
  })

  it('관리자 코드와 팀 패스코드가 같게 설정되면 admin이 우선한다', async () => {
    const env: LoginEnv = { TEAM_PASSCODE: 'same', ADMIN_CODE: 'same', SESSION_SECRET }
    const res = await onRequestPost(makeContext({ code: 'same' }, { env }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, role: 'admin' })
  })

  it('비-JSON 바디 → 400', async () => {
    const res = await onRequestPost(makeContext(null, { raw: 'not json{' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'bad_request' })
  })

  it('Set-Cookie는 HttpOnly·SameSite=Lax·Max-Age를 포함하고 https에서 Secure를 붙인다', async () => {
    const res = await onRequestPost(makeContext({ code: TEAM_PASSCODE }))
    const cookie = res.headers.get('Set-Cookie') ?? ''

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toMatch(/Max-Age=\d+/)
    expect(cookie).toContain('Secure')
  })

  it('http(로컬 개발)에서는 Secure를 붙이지 않는다', async () => {
    const res = await onRequestPost(
      makeContext({ code: TEAM_PASSCODE }, { url: 'http://localhost:8788/api/login' }),
    )
    const cookie = res.headers.get('Set-Cookie') ?? ''

    expect(cookie).toContain('HttpOnly')
    expect(cookie).not.toContain('Secure')
  })
})

// 무차별 대입 방어(#80) — LOGIN_RATE_LIMIT(KV) 바인딩이 있을 때의 실패 카운팅·차단.
describe('POST /api/login — rate limiting', () => {
  const IP = '203.0.113.7'

  function rateLimitedEnv(): LoginEnv {
    return { TEAM_PASSCODE, ADMIN_CODE, SESSION_SECRET, LOGIN_RATE_LIMIT: makeKV() }
  }

  async function fail(env: LoginEnv, ip = IP): Promise<Response> {
    return onRequestPost(makeContext({ code: 'wrong-code' }, { env, ip }))
  }

  it('실패 5회 후 6번째 시도는 429 + Retry-After, Set-Cookie 없음', async () => {
    const env = rateLimitedEnv()
    for (let i = 0; i < 5; i++) expect((await fail(env)).status).toBe(401)

    const res = await fail(env)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'too_many_attempts' })
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('차단 중에는 올바른 코드도 429 — 차단이 검증보다 먼저다', async () => {
    const env = rateLimitedEnv()
    for (let i = 0; i < 5; i++) await fail(env)

    const res = await onRequestPost(makeContext({ code: TEAM_PASSCODE }, { env, ip: IP }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('성공 로그인은 카운터를 지운다 — 이후 실패는 1회부터', async () => {
    const env = rateLimitedEnv()
    for (let i = 0; i < 4; i++) await fail(env)

    const ok = await onRequestPost(makeContext({ code: TEAM_PASSCODE }, { env, ip: IP }))
    expect(ok.status).toBe(200)
    expect(env.LOGIN_RATE_LIMIT!.store.size).toBe(0)

    // 리셋 후 다시 5회를 채워야 차단된다.
    for (let i = 0; i < 5; i++) expect((await fail(env)).status).toBe(401)
    expect((await fail(env)).status).toBe(429)
  })

  it('IP가 다르면 카운터가 독립이다', async () => {
    const env = rateLimitedEnv()
    for (let i = 0; i < 5; i++) await fail(env)

    expect((await fail(env)).status).toBe(429)
    expect((await fail(env, '198.51.100.9')).status).toBe(401)
  })

  it('비-JSON 400은 실패로 카운트하지 않는다', async () => {
    const env = rateLimitedEnv()
    for (let i = 0; i < 6; i++) {
      const res = await onRequestPost(makeContext(null, { env, ip: IP, raw: 'not json{' }))
      expect(res.status).toBe(400)
    }
    expect(env.LOGIN_RATE_LIMIT!.store.size).toBe(0)
  })

  it('LOGIN_RATE_LIMIT 미바인딩이면 fail-open — 반복 실패도 기존 401 그대로', async () => {
    const env: LoginEnv = { TEAM_PASSCODE, ADMIN_CODE, SESSION_SECRET }
    for (let i = 0; i < 8; i++) expect((await fail(env)).status).toBe(401)

    const res = await onRequestPost(makeContext({ code: TEAM_PASSCODE }, { env, ip: IP }))
    expect(res.status).toBe(200)
  })
})
