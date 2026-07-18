import { describe, expect, it } from 'vitest'
import { verifySessionToken } from '../lib/session-cookie'
import { onRequestPost } from './login'

const TEAM_PASSCODE = 'team-passcode-1234'
const ADMIN_CODE = 'admin-code-5678'
const SESSION_SECRET = 'test-session-secret'

type LoginEnv = { TEAM_PASSCODE?: string; ADMIN_CODE?: string; SESSION_SECRET: string }

function makeContext(
  body: unknown,
  {
    env = { TEAM_PASSCODE, ADMIN_CODE, SESSION_SECRET },
    url = 'https://bernice.example/api/login',
    raw,
  }: { env?: LoginEnv; url?: string; raw?: string } = {},
) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
