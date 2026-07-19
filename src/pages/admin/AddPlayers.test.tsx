// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { PlayerSummary, RecordsResponse, SessionEntry } from '../../../shared/domain'
import AddPlayers from './AddPlayers'

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

function entry(playerId: number, name: string): SessionEntry {
  return {
    playerId,
    name,
    participated: true,
    scores: {},
  }
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

function renderPage(initialEntries: Array<string | { pathname: string; state?: unknown }> = ['/admin/add-players']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/admin/add-players" element={<AddPlayers />} />
          <Route path="/admin/records/:sessionDate" element={<RecordsParticipantsStub />} />
          <Route path="/admin/create-sheet" element={<p>기록지 만들기 스텁</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AddPlayers', () => {
  it('세션이 없으면 빈 상태 + 기록지 만들기 CTA를 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, baseData())))

    renderPage()

    expect(await screen.findByText('아직 생성된 회차가 없습니다')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '기록지 만들기' }))
    expect(screen.getByText('기록지 만들기 스텁')).toBeInTheDocument()
  })

  it('router state가 없으면 최신 회차 칩이 기본 선택된다', async () => {
    const data = baseData({
      players: [player(1, '가은'), player(2, '나연')],
      sessions: [
        { date: '2025-05-16', entries: [entry(1, '가은')] },
        { date: '2025-05-23', entries: [entry(2, '나연')] },
      ],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    const latestChip = await screen.findByRole('button', { name: '2차' })
    expect(latestChip).toHaveAttribute('aria-pressed', 'true')
    // 2차(2025-05-23)엔 나연이 이미 참가자라 후보에서 빠지고, 가은만 후보로 남는다.
    expect(screen.getByRole('button', { name: /가은/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /나연/ })).not.toBeInTheDocument()
  })

  it('참가자 목록에서 넘긴 sessionDate가 있으면 그 회차가 미리 선택된다', async () => {
    const data = baseData({
      players: [player(1, '가은'), player(2, '나연')],
      sessions: [
        { date: '2025-05-16', entries: [entry(1, '가은')] },
        { date: '2025-05-23', entries: [entry(2, '나연')] },
      ],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage([{ pathname: '/admin/add-players', state: { sessionDate: '2025-05-16' } }])

    const firstChip = await screen.findByRole('button', { name: '1차' })
    expect(firstChip).toHaveAttribute('aria-pressed', 'true')
    // 1차(2025-05-16)엔 가은이 참가자라 빠지고, 나연만 후보로 남는다.
    expect(screen.getByRole('button', { name: /나연/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /가은/ })).not.toBeInTheDocument()
  })

  it('비활동 상태 선수는 후보에서 제외된다', async () => {
    const data = baseData({
      players: [player(1, '가은'), player(2, '나연', '휴식')],
      sessions: [{ date: '2025-05-16', entries: [] }],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    expect(await screen.findByRole('button', { name: /가은/ })).toBeInTheDocument()
    expect(screen.queryByText('나연')).not.toBeInTheDocument()
  })

  it('선수를 선택하면 확인 바 카운트가 늘어난다', async () => {
    const data = baseData({
      players: [player(1, '가은')],
      sessions: [{ date: '2025-05-16', entries: [] }],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    expect(screen.getByRole('button', { name: '1명 추가하기' })).toBeEnabled()
  })

  it('추가 성공 → 참가자 목록으로 이동하며 토스트 메시지를 넘긴다', async () => {
    const recordsData = baseData({
      players: [player(1, '가은')],
      sessions: [{ date: '2025-05-16', entries: [] }],
    })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/add-players') {
        return Promise.resolve(
          jsonResponse(200, { sessionDate: '2025-05-16', added: [{ playerId: 1, name: '가은' }] }),
        )
      }
      return Promise.resolve(jsonResponse(200, recordsData))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    fireEvent.click(screen.getByRole('button', { name: '1명 추가하기' }))

    expect(await screen.findByText(/참가자 목록 스텁/)).toBeInTheDocument()
    expect(screen.getByText(/1명 추가됨/)).toBeInTheDocument()
  })

  it('추가 실패(409) → 에러 메시지를 노출하고 화면에 머문다', async () => {
    const recordsData = baseData({
      players: [player(1, '가은')],
      sessions: [{ date: '2025-05-16', entries: [] }],
    })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/add-players') {
        return Promise.resolve(
          jsonResponse(409, { error: 'already_participant', message: '이미 참가자인 선수가 있습니다.' }),
        )
      }
      return Promise.resolve(jsonResponse(200, recordsData))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    fireEvent.click(screen.getByRole('button', { name: '1명 추가하기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 참가자인 선수가 있습니다.')
    expect(screen.queryByText(/참가자 목록 스텁/)).not.toBeInTheDocument()
  })

  it('에러 응답이면 에러 패널을 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' })))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  })
})
