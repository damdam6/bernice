// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { EventDefinition, RecordsResponse, SessionEntry } from '../../../shared/domain'
import RecordsParticipants from './RecordsParticipants'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

const EVENTS: EventDefinition[] = [
  { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null },
  { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null },
]
const SESSION_EVENT_KEYS = EVENTS.map((e) => e.key)

function entryWith(playerId: number, name: string, scores: SessionEntry['scores']): SessionEntry {
  return { playerId, name, participated: true, scores }
}

const UNMEASURED: SessionEntry['scores'] = {
  드리블셔틀런: { status: 'unmeasured', value: null, display: null },
  골밑슛: { status: 'unmeasured', value: null, display: null },
}
const RECORDED: SessionEntry['scores'] = {
  드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
  골밑슛: { status: 'recorded', value: 6, display: '6' },
}

function baseData(overrides: Partial<RecordsResponse> = {}): RecordsResponse {
  return {
    generatedAt: '2026-07-19T00:00:00.000Z',
    events: EVENTS,
    players: [],
    sessions: [],
    rankings: [],
    home: { latestSession: null, achievementRates: [] },
    ...overrides,
  }
}

function AddPlayersStub() {
  const location = useLocation()
  const state = location.state as { sessionDate?: string } | null
  return <p>참가자 추가 스텁 (sessionDate: {state?.sessionDate ?? '없음'})</p>
}

function renderPage(sessionDate: string, data: RecordsResponse) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/records/${sessionDate}`]}>
        <Routes>
          <Route path="/admin/records/:sessionDate" element={<RecordsParticipants />} />
          <Route path="/admin/records/:sessionDate/:playerId" element={<p>선수별 입력 스텁</p>} />
          <Route path="/admin/add-players" element={<AddPlayersStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RecordsParticipants', () => {
  it('존재하지 않는 회차면 빈 상태를 노출한다', async () => {
    renderPage('2099-01-01', baseData({ sessions: [] }))

    expect(await screen.findByText('회차를 찾을 수 없습니다')).toBeInTheDocument()
  })

  it('참가자를 가나다 정렬로 나열하고 입력 상태 뱃지를 붙인다', async () => {
    const data = baseData({
      sessions: [
        {
          date: '2025-05-16',
          entries: [
            entryWith(3, '다현', UNMEASURED),
            entryWith(1, '가은', RECORDED),
            entryWith(2, '나연', { ...UNMEASURED, 골밑슛: RECORDED.골밑슛 }),
          ],
          eventKeys: SESSION_EVENT_KEYS,
        },
      ],
    })

    renderPage('2025-05-16', data)

    const rows = await screen.findAllByRole('button', { name: /가은|나연|다현/ })
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('가은'),
      expect.stringContaining('나연'),
      expect.stringContaining('다현'),
    ])
    expect(rows[0]).toHaveTextContent('완료')
    expect(rows[1]).toHaveTextContent('일부')
    expect(rows[2]).toHaveTextContent('미입력')
  })

  it('전역 종목이 이 회차 eventKeys보다 많아도 뱃지는 이 회차 자신의 eventKeys만으로 판정한다(이슈 #126 회귀)', async () => {
    // 전역 events엔 드리블셔틀런·골밑슛 2종목이 있지만, 이 과거 회차는 드리블셔틀런 1종목만 측정했다.
    const data = baseData({
      sessions: [
        {
          date: '2025-05-16',
          eventKeys: ['드리블셔틀런'],
          entries: [
            entryWith(1, '가은', { 드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' } }),
            entryWith(2, '나연', { 드리블셔틀런: { status: 'unmeasured', value: null, display: null } }),
          ],
        },
      ],
    })

    renderPage('2025-05-16', data)

    const rows = await screen.findAllByRole('button', { name: /가은|나연/ })
    // 신규 종목 골밑슛이 이 회차 scores에 아예 없어도(계약상 당연) 완료/미입력 판정이 흔들리지 않는다.
    expect(rows[0]).toHaveTextContent('완료')
    expect(rows[1]).toHaveTextContent('미입력')
  })

  it('참가자 행을 탭하면 선수별 입력 화면으로 이동한다', async () => {
    const data = baseData({
      sessions: [{ date: '2025-05-16', entries: [entryWith(1, '가은', RECORDED)], eventKeys: SESSION_EVENT_KEYS }],
    })

    renderPage('2025-05-16', data)

    fireEvent.click(await screen.findByRole('button', { name: /가은/ }))
    expect(screen.getByText('선수별 입력 스텁')).toBeInTheDocument()
  })

  it('[참가자 추가]를 탭하면 현재 회차를 넘겨 참가자 추가 화면으로 이동한다', async () => {
    const data = baseData({
      sessions: [{ date: '2025-05-16', entries: [entryWith(1, '가은', RECORDED)], eventKeys: SESSION_EVENT_KEYS }],
    })

    renderPage('2025-05-16', data)

    fireEvent.click(await screen.findByRole('button', { name: '참가자 추가' }))
    expect(screen.getByText('참가자 추가 스텁 (sessionDate: 2025-05-16)')).toBeInTheDocument()
  })

  it('navigate state로 toast 메시지가 넘어오면 진입 시 노출한다(기록지 만들기·참가자 추가 성공 착지)', async () => {
    const data = baseData({
      sessions: [{ date: '2025-05-16', entries: [entryWith(1, '가은', RECORDED)], eventKeys: SESSION_EVENT_KEYS }],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[
            { pathname: '/admin/records/2025-05-16', state: { toast: '✓ 2025-05-16 기록지 생성됨 · 팀원 열람에 반영' } },
          ]}
        >
          <Routes>
            <Route path="/admin/records/:sessionDate" element={<RecordsParticipants />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('가은')
    expect(screen.getByText('✓ 2025-05-16 기록지 생성됨 · 팀원 열람에 반영')).toBeInTheDocument()
  })

  it('에러 응답이면 에러 패널을 노출한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' })),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/records/2025-05-16']}>
          <Routes>
            <Route path="/admin/records/:sessionDate" element={<RecordsParticipants />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  })
})
