import { describe, expect, it } from 'vitest'
import { onRequestPost } from './logout'

function makeContext(url = 'https://bernice.example/api/logout') {
  const request = new Request(url, { method: 'POST' })
  return { request } as unknown as Parameters<typeof onRequestPost>[0]
}

describe('POST /api/logout', () => {
  it('항상 200을 반환한다 — 로그아웃은 실패할 이유가 없는 멱등 동작', async () => {
    const res = await onRequestPost(makeContext())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('Set-Cookie가 Max-Age=0으로 세션을 즉시 만료시킨다', async () => {
    const res = await onRequestPost(makeContext())
    const cookie = res.headers.get('Set-Cookie') ?? ''

    expect(cookie).toContain('bernice_session=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('https에서는 Secure를 붙이고, http(로컬 개발)에서는 붙이지 않는다', async () => {
    const httpsRes = await onRequestPost(makeContext('https://bernice.example/api/logout'))
    expect(httpsRes.headers.get('Set-Cookie')).toContain('Secure')

    const httpRes = await onRequestPost(makeContext('http://localhost:8788/api/logout'))
    expect(httpRes.headers.get('Set-Cookie')).not.toContain('Secure')
  })
})
