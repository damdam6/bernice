import { describe, expect, it } from 'vitest'
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  issueSessionToken,
  type SessionRole,
} from '../lib/session-cookie'
import { onRequest } from './_middleware'

const SESSION_SECRET = 'test-session-secret'

// next()가 돌려주는 통과 마커 — 미들웨어를 그대로 빠져나왔는지 참조 동일성으로 확인한다.
const PASSED = new Response('passed')

function makeContext(
  path: string,
  { cookie, env = { SESSION_SECRET } }: { cookie?: string; env?: { SESSION_SECRET: string } } = {},
) {
  const request = new Request(`https://bernice.example${path}`, {
    headers: cookie !== undefined ? { Cookie: cookie } : undefined,
  })
  const calls = { next: 0 }
  const next = () => {
    calls.next += 1
    return Promise.resolve(PASSED)
  }
  // 이 미들웨어는 request·env·next만 쓴다 — 나머지 PagesFunction context 필드는 생략.
  const context = { request, env, next } as unknown as Parameters<typeof onRequest>[0]
  return { context, calls }
}

async function sessionCookie(
  role: SessionRole,
  { secret = SESSION_SECRET, now = Date.now() }: { secret?: string; now?: number } = {},
): Promise<string> {
  return `${SESSION_COOKIE_NAME}=${await issueSessionToken(secret, role, now)}`
}

describe('/api/* 인증 미들웨어', () => {
  it('쿠키 없음 → 401 unauthorized, next 미호출', async () => {
    const { context, calls } = makeContext('/api/records')
    const res = await onRequest(context)

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
    expect(calls.next).toBe(0)
  })

  it('쓰레기 토큰·변조 토큰 → 401', async () => {
    const valid = await sessionCookie('team')
    const tampered = `${valid.slice(0, -4)}xxxx`
    for (const cookie of [`${SESSION_COOKIE_NAME}=garbage`, tampered]) {
      const { context } = makeContext('/api/records', { cookie })
      const res = await onRequest(context)
      expect(res.status, `cookie: ${cookie.slice(0, 40)}…`).toBe(401)
    }
  })

  it('만료 토큰 → 401', async () => {
    const expiredIssuedAt = Date.now() - (SESSION_TTL_SECONDS + 60) * 1000
    const cookie = await sessionCookie('team', { now: expiredIssuedAt })
    const { context } = makeContext('/api/records', { cookie })
    const res = await onRequest(context)

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('다른 secret으로 서명된 토큰 → 401', async () => {
    const cookie = await sessionCookie('team', { secret: 'other-secret' })
    const { context } = makeContext('/api/records', { cookie })
    const res = await onRequest(context)

    expect(res.status).toBe(401)
  })

  it('유효한 team 세션 → 통과(next 1회)', async () => {
    const { context, calls } = makeContext('/api/records', { cookie: await sessionCookie('team') })
    const res = await onRequest(context)

    expect(res).toBe(PASSED)
    expect(calls.next).toBe(1)
  })

  it('/api/admin/* + team 세션 → 403 forbidden, next 미호출', async () => {
    const { context, calls } = makeContext('/api/admin/refresh', {
      cookie: await sessionCookie('team'),
    })
    const res = await onRequest(context)

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'forbidden' })
    expect(calls.next).toBe(0)
  })

  it('/api/admin/* + admin 세션 → 통과', async () => {
    const { context } = makeContext('/api/admin/refresh', { cookie: await sessionCookie('admin') })
    expect(await onRequest(context)).toBe(PASSED)
  })

  it('맨몸 /api/admin도 admin 게이트에 걸린다(team → 403)', async () => {
    const { context } = makeContext('/api/admin', { cookie: await sessionCookie('team') })
    expect((await onRequest(context)).status).toBe(403)
  })

  it('퍼센트 인코딩된 admin 경로(%2F)도 admin 게이트에 걸린다(team → 403)', async () => {
    const { context } = makeContext('/api/admin%2Frefresh', { cookie: await sessionCookie('team') })
    expect((await onRequest(context)).status).toBe(403)
  })

  it('/api/adminx는 admin 경로가 아니다(team → 통과)', async () => {
    const { context } = makeContext('/api/adminx', { cookie: await sessionCookie('team') })
    expect(await onRequest(context)).toBe(PASSED)
  })

  it('예외 경로는 쿠키 없이 통과: /api/login·/api/health', async () => {
    for (const path of ['/api/login', '/api/health']) {
      const { context, calls } = makeContext(path)
      expect(await onRequest(context), path).toBe(PASSED)
      expect(calls.next, path).toBe(1)
    }
  })

  it('예외 경로는 정확 일치만 — /api/login/ 은 보호 대상(쿠키 없음 → 401)', async () => {
    const { context } = makeContext('/api/login/')
    expect((await onRequest(context)).status).toBe(401)
  })
})
