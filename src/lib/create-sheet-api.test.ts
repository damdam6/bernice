import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSheet } from './create-sheet-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('createSheet', () => {
  it('201이면 sessionDate·participantCount를 담아 ok:true를 반환한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { sessionDate: '2026-07-19', participantCount: 3, participants: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createSheet([1, 2, 3])).resolves.toEqual({
      ok: true,
      sessionDate: '2026-07-19',
      participantCount: 3,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/create-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIds: [1, 2, 3] }),
    })
  })

  it('201이라도 계약 위반 필드는 기본값으로 폴백한다 (생성은 이미 성공 — 실패로 바꾸지 않는다)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(201, { sessionDate: null, participantCount: '3' })),
    )

    await expect(createSheet([1, 2, 3])).resolves.toEqual({
      ok: true,
      sessionDate: '',
      participantCount: 0,
    })
  })

  it('409(오늘 이미 생성됨)이면 ok:false와 서버 메시지를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: 'sheet_already_exists',
          message: '오늘(2026-07-19) 회차 탭이 이미 있습니다.',
          sessionDate: '2026-07-19',
        }),
      ),
    )

    await expect(createSheet([1])).resolves.toEqual({
      ok: false,
      error: 'sheet_already_exists',
      message: '오늘(2026-07-19) 회차 탭이 이미 있습니다.',
    })
  })

  it('400(참가자 미선택)이면 ok:false를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, { error: 'no_participants', message: '참가자를 한 명 이상 선택해야 합니다.' }),
      ),
    )

    await expect(createSheet([])).resolves.toEqual({
      ok: false,
      error: 'no_participants',
      message: '참가자를 한 명 이상 선택해야 합니다.',
    })
  })

  it('에러 바디를 파싱할 수 없으면 기본 메시지를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 502 })))

    await expect(createSheet([1])).resolves.toEqual({
      ok: false,
      error: 'unknown_error',
      message: '기록지 생성에 실패했어요. 다시 시도해주세요.',
    })
  })

  it('네트워크 오류(fetch reject)면 throw하지 않고 ok:false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(createSheet([1])).resolves.toEqual({
      ok: false,
      error: 'network_error',
      message: '네트워크 오류로 생성하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
    })
  })
})
