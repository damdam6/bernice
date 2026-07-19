import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveRecord } from './records-write-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('saveRecord', () => {
  it('200이면 정규화된 scores를 담아 ok:true를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        sessionDate: '2025-08-16',
        playerId: 7,
        name: '선수7',
        scores: {
          드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
          골밑슛: { status: 'recorded', value: 6, display: '6' },
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveRecord('2025-08-16', 7, { 드리블셔틀런: '1:12', 골밑슛: '6' })).resolves.toEqual({
      ok: true,
      sessionDate: '2025-08-16',
      playerId: 7,
      name: '선수7',
      scores: {
        드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
        골밑슛: { status: 'recorded', value: 6, display: '6' },
      },
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDate: '2025-08-16', playerId: 7, scores: { 드리블셔틀런: '1:12', 골밑슛: '6' } }),
    })
  })

  it('400(validation_failed)이면 ok:false와 서버 메시지를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, { error: 'validation_failed', message: '점수 값이 올바르지 않습니다.' }),
      ),
    )

    await expect(saveRecord('2025-08-16', 7, {})).resolves.toEqual({
      ok: false,
      error: 'validation_failed',
      message: '점수 값이 올바르지 않습니다.',
    })
  })

  it('404(session_not_found)면 ok:false와 서버 메시지를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, { error: 'session_not_found', message: '회차 탭(2025-08-16)을 찾을 수 없습니다.' }),
      ),
    )

    await expect(saveRecord('2025-08-16', 7, {})).resolves.toEqual({
      ok: false,
      error: 'session_not_found',
      message: '회차 탭(2025-08-16)을 찾을 수 없습니다.',
    })
  })

  it('502(sheets_api_error)면 ok:false와 서버 메시지를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(502, { error: 'sheets_api_error', message: 'Sheets API 오류' })),
    )

    await expect(saveRecord('2025-08-16', 7, {})).resolves.toEqual({
      ok: false,
      error: 'sheets_api_error',
      message: 'Sheets API 오류',
    })
  })

  it('에러 바디를 파싱할 수 없으면 기본 메시지를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })))

    await expect(saveRecord('2025-08-16', 7, {})).resolves.toEqual({
      ok: false,
      error: 'unknown_error',
      message: '저장에 실패했어요. 다시 시도해주세요.',
    })
  })

  it('네트워크 오류(fetch reject)면 throw하지 않고 ok:false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(saveRecord('2025-08-16', 7, {})).resolves.toEqual({
      ok: false,
      error: 'network_error',
      message: '네트워크 오류로 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
    })
  })
})
