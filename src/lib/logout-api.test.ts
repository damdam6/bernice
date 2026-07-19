import { afterEach, describe, expect, it, vi } from 'vitest'
import { logout } from './logout-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('logout', () => {
  it('POST /api/logout을 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await logout()

    expect(fetchMock).toHaveBeenCalledWith('/api/logout', { method: 'POST' })
  })

  it('네트워크 오류는 감싸지 않고 그대로 전파한다', async () => {
    const networkError = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))

    await expect(logout()).rejects.toBe(networkError)
  })
})
