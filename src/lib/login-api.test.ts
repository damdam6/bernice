import { afterEach, describe, expect, it, vi } from 'vitest'
import { loginWithPasscode } from './login-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('loginWithPasscode', () => {
  it('200이면 ok:true와 서버가 준 role을 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, role: 'team' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loginWithPasscode('team-passcode-1234')).resolves.toEqual({ ok: true, role: 'team' })
    expect(fetchMock).toHaveBeenCalledWith('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'team-passcode-1234' }),
    })
  })

  it('200 + role:admin이면 ok:true와 role:admin을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, role: 'admin' })))

    await expect(loginWithPasscode('admin-code-5678')).resolves.toEqual({ ok: true, role: 'admin' })
  })

  it('실패 응답이면 ok:false와 서버 message를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { error: 'invalid_passcode', message: '패스코드가 올바르지 않습니다.' }),
      ),
    )

    await expect(loginWithPasscode('wrong-code')).resolves.toEqual({
      ok: false,
      message: '패스코드가 올바르지 않습니다.',
    })
  })

  it('200이라도 role이 team/admin 화이트리스트 밖이면 role 없이 ok:true를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, role: 'root' })))

    await expect(loginWithPasscode('x')).resolves.toEqual({ ok: true, role: undefined })
  })

  it('200 + 객체가 아닌 바디(배열)면 role 없이 ok:true를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, ['ok'])))

    await expect(loginWithPasscode('x')).resolves.toEqual({ ok: true, role: undefined })
  })

  it('실패 바디의 message가 문자열이 아니면 message 없이 ok:false를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid_passcode', message: 401 })),
    )

    await expect(loginWithPasscode('x')).resolves.toEqual({ ok: false, message: undefined })
  })

  it('에러 바디를 JSON으로 파싱할 수 없으면 message 없이 ok:false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })))

    await expect(loginWithPasscode('x')).resolves.toEqual({ ok: false, message: undefined })
  })

  it('네트워크 오류는 감싸지 않고 그대로 전파한다', async () => {
    const networkError = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))

    await expect(loginWithPasscode('x')).rejects.toBe(networkError)
  })
})
