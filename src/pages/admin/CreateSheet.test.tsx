// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { PlayerSummary, RecordsResponse } from '../../../shared/domain'
import CreateSheet from './CreateSheet'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

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

  it('생성 실패(409) → 에러 메시지를 노출하고 화면에 머문다', async () => {
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

    expect(await screen.findByRole('alert')).toHaveTextContent('오늘(2026-07-19) 회차 탭이 이미 있습니다.')
    expect(screen.queryByText(/참가자 목록 스텁/)).not.toBeInTheDocument()
  })

  it('에러 응답이면 에러 패널을 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' })))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  })
})
