import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshRecordsCache } from './refresh-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('refreshRecordsCache', () => {
  it('200이면 ok:true를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { deleted: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshRecordsCache()).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/refresh', { method: 'POST' })
  })

  it('캐시가 비어 있던 200({ deleted: false })도 성공이다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { deleted: false })))

    await expect(refreshRecordsCache()).resolves.toEqual({ ok: true })
  })

  it('실패 응답이면 서버 message를 담아 ok:false를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized', message: '로그인이 필요합니다.' })),
    )

    await expect(refreshRecordsCache()).resolves.toEqual({ ok: false, message: '로그인이 필요합니다.' })
  })

  it('에러 바디를 파싱할 수 없으면 기본 메시지를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 502 })))

    await expect(refreshRecordsCache()).resolves.toEqual({
      ok: false,
      message: '캐시 비우기에 실패했어요. 다시 시도해주세요.',
    })
  })

  it('네트워크 오류(fetch reject)면 throw하지 않고 ok:false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(refreshRecordsCache()).resolves.toEqual({
      ok: false,
      message: '네트워크 오류로 새로 고침하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
    })
  })
})
