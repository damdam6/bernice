import { afterEach, describe, expect, it, vi } from 'vitest'
import { addPlayers } from './add-players-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('addPlayers', () => {
  it('200이면 sessionDate·added를 담아 ok:true를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { sessionDate: '2025-05-16', added: [{ playerId: 7, name: '선수7' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(addPlayers('2025-05-16', [7])).resolves.toEqual({
      ok: true,
      sessionDate: '2025-05-16',
      added: [{ playerId: 7, name: '선수7' }],
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/add-players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDate: '2025-05-16', playerIds: [7] }),
    })
  })

  it('404(회차 없음)이면 ok:false와 서버 메시지를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, { error: 'session_not_found', message: '회차 탭(2025-05-16)을 찾을 수 없습니다.' }),
      ),
    )

    await expect(addPlayers('2025-05-16', [7])).resolves.toEqual({
      ok: false,
      error: 'session_not_found',
      message: '회차 탭(2025-05-16)을 찾을 수 없습니다.',
    })
  })

  it('409(이미 참가자)이면 ok:false를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: 'already_participant',
          message: '이미 참가자인 선수가 있습니다.',
          conflictPlayerIds: [7],
        }),
      ),
    )

    await expect(addPlayers('2025-05-16', [7])).resolves.toEqual({
      ok: false,
      error: 'already_participant',
      message: '이미 참가자인 선수가 있습니다.',
    })
  })

  it('에러 바디를 파싱할 수 없으면 기본 메시지를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 502 })))

    await expect(addPlayers('2025-05-16', [7])).resolves.toEqual({
      ok: false,
      error: 'unknown_error',
      message: '참가자 추가에 실패했어요. 다시 시도해주세요.',
    })
  })
})
