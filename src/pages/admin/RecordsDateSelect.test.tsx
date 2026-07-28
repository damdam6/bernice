// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { EventDefinition, RecordsResponse, SessionEntry } from '../../../shared/domain'
import RecordsDateSelect from './RecordsDateSelect'
import { jsonResponse } from '../../test/json-response'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EVENTS: EventDefinition[] = [
  { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null, exemptable: false },
  { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null, exemptable: false },
]
const SESSION_EVENT_KEYS = EVENTS.map((e) => e.key)

function completedEntry(playerId: number, name: string): SessionEntry {
  return {
    playerId,
    name,
    participated: true,
    scores: {
      드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
      골밑슛: { status: 'recorded', value: 6, display: '6' },
    },
  }
}

function unmeasuredEntry(playerId: number, name: string): SessionEntry {
  return {
    playerId,
    name,
    participated: false,
    scores: {
      드리블셔틀런: { status: 'unmeasured', value: null, display: null },
      골밑슛: { status: 'unmeasured', value: null, display: null },
    },
  }
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

function renderPage(initialEntries: string[] = ['/admin/records']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/admin/records" element={<RecordsDateSelect />} />
          <Route path="/admin/records/:sessionDate" element={<p>참가자 목록 스텁</p>} />
          <Route path="/admin/create-sheet" element={<p>기록지 만들기 스텁</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RecordsDateSelect', () => {
  it('세션이 없으면 빈 상태 + 기록지 만들기 CTA를 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, baseData())))

    renderPage()

    expect(await screen.findByText('아직 생성된 회차가 없습니다')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '기록지 만들기' }))
    expect(screen.getByText('기록지 만들기 스텁')).toBeInTheDocument()
  })

  it('회차 카드를 최신부터(역순) n차 라벨과 완료 n/N으로 렌더한다', async () => {
    const data = baseData({
      sessions: [
        { date: '2025-05-16', entries: [completedEntry(1, '가은'), unmeasuredEntry(2, '나연')], eventKeys: SESSION_EVENT_KEYS },
        { date: '2025-05-23', entries: [completedEntry(1, '가은'), completedEntry(2, '나연')], eventKeys: SESSION_EVENT_KEYS },
      ],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    const cards = await screen.findAllByRole('button')
    // 최신(2차)이 먼저 노출된다.
    expect(cards[0]).toHaveTextContent('2차')
    expect(cards[0]).toHaveTextContent('2025-05-23')
    expect(cards[0]).toHaveTextContent('완료 2/2')
    expect(cards[1]).toHaveTextContent('1차')
    expect(cards[1]).toHaveTextContent('2025-05-16')
    expect(cards[1]).toHaveTextContent('완료 1/2')
  })

  it('회차마다 eventKeys 종목 수가 달라도 각자 자기 회차 기준으로만 완료를 판정한다(이슈 #126 회귀)', async () => {
    const data = baseData({
      sessions: [
        {
          date: '2025-05-16',
          eventKeys: ['드리블셔틀런'],
          entries: [
            { playerId: 1, name: '가은', participated: true, scores: { 드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' } } },
          ],
        },
        {
          date: '2025-06-20',
          eventKeys: ['드리블셔틀런', '골밑슛'],
          entries: [
            {
              playerId: 1,
              name: '가은',
              participated: true,
              scores: {
                드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
                골밑슛: { status: 'unmeasured', value: null, display: null },
              },
            },
          ],
        },
      ],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    const cards = await screen.findAllByRole('button')
    // 2차(2종목 회차) — 드리블셔틀런만 기록, 골밑슛은 미측정이라 완료 아님(일부).
    expect(cards[0]).toHaveTextContent('2차')
    expect(cards[0]).toHaveTextContent('완료 0/1')
    // 1차(1종목 회차) — 그 회차 유일한 종목을 기록해 완료. 2차에 종목이 늘었다고 흔들리지 않는다.
    expect(cards[1]).toHaveTextContent('1차')
    expect(cards[1]).toHaveTextContent('완료 1/1')
  })

  it('회차 카드를 탭하면 그 회차 참가자 목록으로 이동한다', async () => {
    const data = baseData({
      sessions: [{ date: '2025-05-16', entries: [completedEntry(1, '가은')], eventKeys: SESSION_EVENT_KEYS }],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, data)))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /1차/ }))
    expect(screen.getByText('참가자 목록 스텁')).toBeInTheDocument()
  })

  it('에러 응답이면 에러 패널을 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' })))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  })
})
