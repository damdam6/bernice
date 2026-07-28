// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { PlayerSummary, RecordsResponse } from '../../../shared/domain'
import CreateSheet from './CreateSheet'
import { formatSeoulDate } from '../../lib/seoul-date'
import { jsonResponse } from '../../test/json-response'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function player(id: number, name: string, status: PlayerSummary['status'] = '활동'): PlayerSummary {
  return { id, name, status, trends: [], personalBests: [] }
}

function baseData(overrides: Partial<RecordsResponse> = {}): RecordsResponse {
  return {
    generatedAt: '2026-07-19T00:00:00.000Z',
    events: [],
    players: [],
    sessions: [],
    rankings: [],
    home: { latestSession: null, achievementRates: [] },
    ...overrides,
  }
}

function RecordsParticipantsStub() {
  const location = useLocation()
  const state = location.state as { toast?: string } | null
  return <p>참가자 목록 스텁 (toast: {state?.toast ?? '없음'})</p>
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/create-sheet']}>
        <Routes>
          <Route path="/admin/create-sheet" element={<CreateSheet />} />
          <Route path="/admin/records/:sessionDate" element={<RecordsParticipantsStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CreateSheet', () => {
  it('오늘 날짜 헤더와 활동 선수만 가나다 정렬로 노출한다(기본 전부 해제)', async () => {
    const data = baseData({
      players: [player(3, '다현'), player(1, '가은'), player(2, '나연', '휴식')],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    expect(await screen.findByText(/오늘 · \d{4}-\d{2}-\d{2} \(Asia\/Seoul\)/)).toBeInTheDocument()

    const rows = screen.getAllByRole('button', { name: /가은|다현/ })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('가은')
    expect(rows[1]).toHaveTextContent('다현')
    expect(screen.queryByText('나연')).not.toBeInTheDocument()
    rows.forEach((row) => expect(row).toHaveAttribute('aria-pressed', 'false'))

    expect(screen.getByRole('button', { name: '0명으로 기록지 만들기' })).toBeDisabled()
  })

  it('선수를 선택하면 확인 바 카운트가 늘고, 다시 누르면 해제된다', async () => {
    const data = baseData({ players: [player(1, '가은')] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    const row = await screen.findByRole('button', { name: /가은/ })
    fireEvent.click(row)
    expect(screen.getByRole('button', { name: '1명으로 기록지 만들기' })).toBeEnabled()
    expect(row).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(row)
    expect(screen.getByRole('button', { name: '0명으로 기록지 만들기' })).toBeDisabled()
  })

  it('생성 성공 → 참가자 목록으로 이동하며 토스트 메시지를 넘긴다', async () => {
    const recordsData = baseData({ players: [player(1, '가은')] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/create-sheet') {
        return Promise.resolve(
          jsonResponse(201, { sessionDate: '2026-07-19', participantCount: 1, participants: [] }),
        )
      }
      return Promise.resolve(jsonResponse(200, recordsData))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    fireEvent.click(screen.getByRole('button', { name: '1명으로 기록지 만들기' }))

    expect(await screen.findByText(/참가자 목록 스텁/)).toBeInTheDocument()
    expect(screen.getByText(/기록지 생성됨/)).toBeInTheDocument()
  })

  it('생성 실패(409) → 하단 고정 바에 안내와 [기록 입력으로 이동] CTA를 띄우고 화면에 머문다', async () => {
    const recordsData = baseData({ players: [player(1, '가은')] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/create-sheet') {
        return Promise.resolve(
          jsonResponse(409, {
            error: 'sheet_already_exists',
            message: '오늘(2026-07-19) 회차 탭이 이미 있습니다.',
            sessionDate: '2026-07-19',
          }),
        )
      }
      return Promise.resolve(jsonResponse(200, recordsData))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    fireEvent.click(screen.getByRole('button', { name: '1명으로 기록지 만들기' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('오늘(2026-07-19) 기록지가 이미 있어요')
    // 스크롤 위치와 무관하게 보이도록 고정 바(fixed) 내부에 렌더돼야 한다(#155).
    expect(alert.closest('.fixed')).not.toBeNull()
    expect(screen.getByRole('button', { name: '기록 입력으로 이동' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /명으로 기록지 만들기/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/참가자 목록 스텁/)).not.toBeInTheDocument()
  })

  it('409 CTA → 강제 새로 고침 성공 후 해당 날짜 참가자 목록으로 이동한다', async () => {
    const recordsData = baseData({ players: [player(1, '가은')] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/create-sheet') {
        return Promise.resolve(
          jsonResponse(409, {
            error: 'sheet_already_exists',
            message: '오늘(2026-07-19) 회차 탭이 이미 있습니다.',
            sessionDate: '2026-07-19',
          }),
        )
      }
      if (url === '/api/refresh') return Promise.resolve(jsonResponse(200, { deleted: true }))
      return Promise.resolve(jsonResponse(200, recordsData))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    fireEvent.click(screen.getByRole('button', { name: '1명으로 기록지 만들기' }))
    fireEvent.click(await screen.findByRole('button', { name: '기록 입력으로 이동' }))

    expect(await screen.findByText(/참가자 목록 스텁/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/refresh', { method: 'POST' })
  })

  it('409 CTA의 새로 고침이 실패하면 이동하지 않고 실패 문구를 보여준다', async () => {
    const recordsData = baseData({ players: [player(1, '가은')] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/create-sheet') {
        return Promise.resolve(
          jsonResponse(409, {
            error: 'sheet_already_exists',
            message: '오늘(2026-07-19) 회차 탭이 이미 있습니다.',
            sessionDate: '2026-07-19',
          }),
        )
      }
      if (url === '/api/refresh') {
        return Promise.resolve(jsonResponse(500, { message: '엣지 캐시를 비우지 못했어요.' }))
      }
      return Promise.resolve(jsonResponse(200, recordsData))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    fireEvent.click(screen.getByRole('button', { name: '1명으로 기록지 만들기' }))
    fireEvent.click(await screen.findByRole('button', { name: '기록 입력으로 이동' }))

    expect(await screen.findByText('엣지 캐시를 비우지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText(/참가자 목록 스텁/)).not.toBeInTheDocument()
    // 재시도 가능해야 한다 — CTA는 그대로 남는다.
    expect(screen.getByRole('button', { name: '기록 입력으로 이동' })).toBeEnabled()
  })

  it('records에 오늘 세션이 이미 있으면 사전 안내 배너를 보여주고, 배너 CTA는 바로 이동한다', async () => {
    const today = formatSeoulDate(new Date())
    const data = baseData({
      players: [player(1, '가은')],
      sessions: [{ date: today, entries: [], eventKeys: [] }],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    expect(await screen.findByText(`오늘(${today}) 기록지가 이미 있어요`)).toBeInTheDocument()
    // 배너는 안내일 뿐 만들기 플로우를 차단하지 않는다(스테일 캐시 가능성 — 최종 판정은 서버 가드).
    expect(screen.getByRole('button', { name: '0명으로 기록지 만들기' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '기록 입력으로 이동' }))
    expect(await screen.findByText(/참가자 목록 스텁/)).toBeInTheDocument()
  })

  it('일반 실패 문구도 하단 고정 바 내부에 렌더된다', async () => {
    const recordsData = baseData({ players: [player(1, '가은')] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/create-sheet') {
        return Promise.resolve(jsonResponse(502, { error: 'sheets_api_error', message: 'Sheets API 오류' }))
      }
      return Promise.resolve(jsonResponse(200, recordsData))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    fireEvent.click(screen.getByRole('button', { name: '1명으로 기록지 만들기' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sheets API 오류')
    expect(alert.closest('.fixed')).not.toBeNull()
    // 409가 아니므로 만들기 버튼은 유지된다 — 재시도 경로.
    expect(screen.getByRole('button', { name: '1명으로 기록지 만들기' })).toBeEnabled()
  })

  it('에러 응답이면 에러 패널을 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' })))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  })
})
