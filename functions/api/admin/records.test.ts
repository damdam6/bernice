import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SheetRawBundle } from '../../lib/sheetsApi'

const { fetchSheetBundleMock, updateValuesMock } = vi.hoisted(() => ({
  fetchSheetBundleMock: vi.fn(),
  updateValuesMock: vi.fn(),
}))

vi.mock('../../lib/sheetsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sheetsApi')>()
  return { ...actual, fetchSheetBundle: fetchSheetBundleMock }
})
vi.mock('../../lib/sheetsWriteApi', () => ({ updateValues: updateValuesMock }))

const { onRequestPost } = await import('./records')
const { SheetsApiError } = await import('../../lib/sheetsApi')

// 명단: 선수1(id1)·선수2(id2)·선수3(id3, 회차 미참가). 목표: 시간 1 + 개수 3.
// 회차 2025-08-16: 선수1·선수2만 행이 있음(선수3 없음 = 미참가 테스트용).
function makeBundle(): SheetRawBundle {
  return {
    roster: {
      name: '버니스명단',
      values: [
        ['이름', '상태'],
        ['선수1', '활동'],
        ['선수2', '활동'],
        ['선수3', '활동'],
      ],
    },
    goals: {
      name: '목표',
      values: [
        ['종목', '목표', '만점', '방향', '종료 회차'],
        ['드리블셔틀런', '1:30', '-', '낮을수록', ''],
        ['골밑슛', '5', '10', '높을수록', ''],
        ['자유투', '5', '10', '높을수록', ''],
        ['45도패스캐치', '5', '-', '높을수록', ''],
      ],
    },
    rounds: [
      {
        name: '2025-08-16',
        date: new Date('2025-08-16T00:00:00Z'),
        values: [
          ['이름', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치'],
          ['선수1', '1:20', '4', '3', '2'],
          ['선수2', '', '', '', ''],
        ],
      },
    ],
    unclassified: [],
  }
}

const FULL_SCORES = { 드리블셔틀런: '1:12', 골밑슛: '6', 자유투: '면제', '45도패스캐치': '' }

// makeBundle()은 goals를 항상 채워 돌려주지만 SheetRawBundle 타입상 goals는 null일 수 있어,
// 테스트에서 목표 탭에 종목 행을 추가할 때(#122) 매번 null 좁히기를 반복하지 않도록 모은다.
function addGoalRow(bundle: SheetRawBundle, row: string[]): void {
  if (bundle.goals === null) throw new Error('unreachable — makeBundle()이 항상 goals를 채운다')
  bundle.goals.values.push(row)
}

function makeContext(body: unknown, { raw }: { raw?: string } = {}) {
  const request = new Request('https://bernice.example/api/admin/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body),
  })
  return {
    request,
    env: { GOOGLE_SERVICE_ACCOUNT_KEY: '{}', SHEET_ID: 'sheet-under-test' },
  } as unknown as Parameters<typeof onRequestPost>[0]
}

const cacheDelete = vi.fn(async () => true)

beforeEach(() => {
  vi.stubGlobal('caches', { default: { delete: cacheDelete } })
  updateValuesMock.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchSheetBundleMock.mockReset()
  updateValuesMock.mockReset()
  cacheDelete.mockClear()
})

describe('POST /api/admin/records', () => {
  it('정상 저장 → 점수 셀 범위만 RAW 쓰기 + 캐시 무효화(응답 전) + EventScore 200', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: FULL_SCORES }))

    expect(res.status).toBe(200)
    // 선수2는 회차 탭 데이터 3번째 행 → 시트 3행. 점수 열은 B~E.
    expect(updateValuesMock).toHaveBeenCalledTimes(1)
    expect(updateValuesMock).toHaveBeenCalledWith(
      expect.anything(),
      'sheet-under-test',
      "'2025-08-16'!B3:E3",
      [['1:12', '6', '면제', '']],
    )
    expect(cacheDelete).toHaveBeenCalledTimes(1)

    const body = (await res.json()) as {
      sessionDate: string
      playerId: number
      name: string
      scores: Record<string, { status: string; value: number | null; display: string | null }>
    }
    expect(body.sessionDate).toBe('2025-08-16')
    expect(body.playerId).toBe(2)
    expect(body.name).toBe('선수2')
    expect(body.scores['드리블셔틀런']).toEqual({ status: 'recorded', value: 72, display: '1:12' })
    expect(body.scores['골밑슛']).toEqual({ status: 'recorded', value: 6, display: '6' })
    expect(body.scores['자유투']).toEqual({ status: 'exempt', value: null, display: null })
    expect(body.scores['45도패스캐치']).toEqual({ status: 'unmeasured', value: null, display: null })
  })

  it('invalid 점수(1:75)는 400 + reason, 시트에 쓰지 않는다', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(
      makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: { ...FULL_SCORES, 드리블셔틀런: '1:75' } }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; invalid: { event: string; reason: string }[] }
    expect(body.error).toBe('validation_failed')
    expect(body.invalid.map((i) => i.event)).toContain('드리블셔틀런')
    expect(updateValuesMock).not.toHaveBeenCalled()
    expect(cacheDelete).not.toHaveBeenCalled()
  })

  it('valueKind 불일치(개수 종목에 시간)는 400, 시트에 쓰지 않는다', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(
      makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: { ...FULL_SCORES, 골밑슛: '1:15' } }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; invalid: { event: string }[] }
    expect(body.error).toBe('validation_failed')
    expect(body.invalid.map((i) => i.event)).toContain('골밑슛')
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('scores key 누락은 400 + missing', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(
      makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: { 드리블셔틀런: '1:12', 골밑슛: '6' } }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; missing: string[] }
    expect(body.error).toBe('validation_failed')
    expect(body.missing).toEqual(expect.arrayContaining(['자유투', '45도패스캐치']))
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('알 수 없는 종목 key는 400 + unknown', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(
      makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: { ...FULL_SCORES, 없는종목: '3' } }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; unknown: string[] }
    expect(body.error).toBe('validation_failed')
    expect(body.unknown).toEqual(['없는종목'])
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('존재하지 않는 playerId는 400', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(makeContext({ sessionDate: '2025-08-16', playerId: 99, scores: FULL_SCORES }))

    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('validation_failed')
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('sessionDate 형식 오류는 400이며 시트를 읽지 않는다(fail-fast)', async () => {
    const res = await onRequestPost(makeContext({ sessionDate: '2025-8-16', playerId: 2, scores: FULL_SCORES }))

    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('validation_failed')
    expect(fetchSheetBundleMock).not.toHaveBeenCalled()
  })

  it('형식은 맞지만 회차 탭이 없으면 404 session_not_found', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(makeContext({ sessionDate: '2025-09-20', playerId: 2, scores: FULL_SCORES }))

    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toBe('session_not_found')
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('명단엔 있으나 회차 참가자가 아니면 404 not_participant', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())

    const res = await onRequestPost(makeContext({ sessionDate: '2025-08-16', playerId: 3, scores: FULL_SCORES }))

    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toBe('not_participant')
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('회차 탭 이름 열 동명 중복은 500 sheet_data_invalid', async () => {
    const bundle = makeBundle()
    bundle.rounds[0].values.push(['선수2', '', '', '', '']) // 선수2 중복
    fetchSheetBundleMock.mockResolvedValue(bundle)

    const res = await onRequestPost(makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: FULL_SCORES }))

    expect(res.status).toBe(500)
    expect(((await res.json()) as { error: string }).error).toBe('sheet_data_invalid')
    expect(updateValuesMock).not.toHaveBeenCalled()
  })

  it('쓰기 SheetsApiError는 502 sheets_api_error(+upstreamStatus)', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())
    updateValuesMock.mockRejectedValue(new SheetsApiError('Sheets API 쓰기 실패 (500): ...', 500))

    const res = await onRequestPost(makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: FULL_SCORES }))

    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; upstreamStatus: number }
    expect(body.error).toBe('sheets_api_error')
    expect(body.upstreamStatus).toBe(500)
    expect(cacheDelete).not.toHaveBeenCalled()
  })

  it('읽기 SheetsApiError도 502로 매핑된다', async () => {
    fetchSheetBundleMock.mockRejectedValue(new SheetsApiError('Sheets API 호출 실패 (401): ...', 401))

    const res = await onRequestPost(makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: FULL_SCORES }))

    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: string }).error).toBe('sheets_api_error')
  })

  it('비-JSON 바디는 400이며 시트를 읽지 않는다', async () => {
    const res = await onRequestPost(makeContext(undefined, { raw: 'not-json{' }))

    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('validation_failed')
    expect(fetchSheetBundleMock).not.toHaveBeenCalled()
  })

  // #122 — mapHeaderToEvents 재사용으로 #112의 회차별 종목 서브셋 완화(V3)를 엔드포인트 응답
  // 계약(4xx)까지 상속하는지 못박는다. 목표 탭 종목·회차 헤더가 어긋나는 두 경계를 검증한다:
  // 종료 회차보다 뒤 회차(비측정, 그 컬럼이 헤더에 없음) vs 종료 회차 당일(경계 포함, 있음).
  describe('회차별 측정 종목 계약 — 비측정 종목 4xx · 종료 경계 정상 동작 (#122)', () => {
    it('scores에 그 회차 비측정 종목(이미 종료된 종목) key가 오면 400 + unknown, 시트에 쓰지 않는다', async () => {
      const bundle = makeBundle()
      // 윗몸일으키기는 2025-07-01에 종료 — 2025-08-16 회차 헤더엔 이 컬럼이 없다(V3 자연 소멸).
      addGoalRow(bundle, ['윗몸일으키기', '10', '15', '높을수록', '2025-07-01'])
      fetchSheetBundleMock.mockResolvedValue(bundle)

      const res = await onRequestPost(
        makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: { ...FULL_SCORES, 윗몸일으키기: '12' } }),
      )

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; unknown: string[] }
      expect(body.error).toBe('validation_failed')
      expect(body.unknown).toEqual(['윗몸일으키기'])
      expect(updateValuesMock).not.toHaveBeenCalled()
    })

    it('종료 회차 경계(그 당일) 회차는 헤더에 컬럼이 있으므로 정상 저장된다', async () => {
      const bundle = makeBundle()
      // 윗몸일으키기의 종료 회차가 이 회차(2025-08-16) 그 자체 — 경계 포함이라 헤더에 컬럼이 있다.
      addGoalRow(bundle, ['윗몸일으키기', '10', '15', '높을수록', '2025-08-16'])
      bundle.rounds[0].values[0].push('윗몸일으키기')
      bundle.rounds[0].values[1].push('7') // 선수1
      bundle.rounds[0].values[2].push('') // 선수2
      fetchSheetBundleMock.mockResolvedValue(bundle)

      const res = await onRequestPost(
        makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: { ...FULL_SCORES, 윗몸일으키기: '9' } }),
      )

      expect(res.status).toBe(200)
      expect(updateValuesMock).toHaveBeenCalledWith(
        expect.anything(),
        'sheet-under-test',
        "'2025-08-16'!B3:F3",
        [['1:12', '6', '면제', '', '9']],
      )
      const body = (await res.json()) as { scores: Record<string, { status: string; value: number | null }> }
      expect(body.scores['윗몸일으키기']).toEqual({ status: 'recorded', value: 9, display: '9' })
    })
  })

  it('예기치 못한 오류는 내부 메시지를 노출하지 않고 500 internal_error로 응답한다', async () => {
    fetchSheetBundleMock.mockResolvedValue(makeBundle())
    cacheDelete.mockRejectedValueOnce(new Error('INTERNAL_SECRET_스택_흔적'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await onRequestPost(makeContext({ sessionDate: '2025-08-16', playerId: 2, scores: FULL_SCORES }))

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('internal_error')
    expect(body.message).toBe('서버 오류가 발생했습니다.')
    expect(body.message).not.toContain('INTERNAL_SECRET') // 내부 메시지 비노출
    expect(errorLog).toHaveBeenCalled() // 상세는 서버 로그로만

    errorLog.mockRestore()
  })
})
