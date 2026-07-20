// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecordsResponse } from '../../shared/domain'
import Players from './Players'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function createWrapper() {
  const client = new QueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function renderPlayers() {
  return render(<Players />, { wrapper: createWrapper() })
}

const EMPTY_BODY: RecordsResponse = {
  generatedAt: '2026-07-21T00:00:00.000Z',
  events: [],
  players: [],
  sessions: [],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

// 종목 2개(개수+만점 / 시간+만점없음) × 회차 2개(과거·최신), trends·personalBests까지 채워
// 화면 배선(레이더·성장 카드·추이 확장·선수/회차 전환)을 통째로 검증한다.
const RECORDS_BODY: RecordsResponse = {
  generatedAt: '2026-07-21T00:00:00.000Z',
  events: [
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
    { key: '셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
  ],
  players: [
    {
      id: 1,
      name: '선수1',
      status: '활동',
      trends: [
        {
          event: '골밑슛',
          points: [
            { sessionDate: '2026-06-01', value: 6, display: '6', achieved: true, deltaFromPrevious: null, improved: null },
            { sessionDate: '2026-06-08', value: 8, display: '8', achieved: true, deltaFromPrevious: 2, improved: true },
          ],
        },
        {
          event: '셔틀런',
          points: [
            { sessionDate: '2026-06-01', value: 90, display: '1:30', achieved: false, deltaFromPrevious: null, improved: null },
            { sessionDate: '2026-06-08', value: 80, display: '1:20', achieved: false, deltaFromPrevious: -10, improved: true },
          ],
        },
      ],
      personalBests: [
        { event: '골밑슛', value: 8, display: '8', sessionDate: '2026-06-08', achieved: true },
        { event: '셔틀런', value: 80, display: '1:20', sessionDate: '2026-06-08', achieved: false },
      ],
    },
    {
      id: 2,
      name: '선수2',
      status: '활동',
      trends: [
        {
          event: '골밑슛',
          points: [
            { sessionDate: '2026-06-01', value: 4, display: '4', achieved: false, deltaFromPrevious: null, improved: null },
          ],
        },
        {
          event: '셔틀런',
          points: [
            { sessionDate: '2026-06-01', value: 100, display: '1:40', achieved: false, deltaFromPrevious: null, improved: null },
            { sessionDate: '2026-06-08', value: 95, display: '1:35', achieved: false, deltaFromPrevious: -5, improved: true },
          ],
        },
      ],
      personalBests: [
        { event: '골밑슛', value: 4, display: '4', sessionDate: '2026-06-01', achieved: false },
        { event: '셔틀런', value: 95, display: '1:35', sessionDate: '2026-06-08', achieved: false },
      ],
    },
  ],
  sessions: [
    {
      date: '2026-06-01',
      entries: [
        {
          playerId: 1,
          name: '선수1',
          participated: true,
          scores: {
            골밑슛: { status: 'recorded', value: 6, display: '6' },
            셔틀런: { status: 'recorded', value: 90, display: '1:30' },
          },
        },
        {
          playerId: 2,
          name: '선수2',
          participated: true,
          scores: {
            골밑슛: { status: 'recorded', value: 4, display: '4' },
            셔틀런: { status: 'recorded', value: 100, display: '1:40' },
          },
        },
      ],
    },
    {
      date: '2026-06-08',
      entries: [
        {
          playerId: 1,
          name: '선수1',
          participated: true,
          scores: {
            골밑슛: { status: 'recorded', value: 8, display: '8' },
            셔틀런: { status: 'recorded', value: 80, display: '1:20' },
          },
        },
        {
          playerId: 2,
          name: '선수2',
          participated: true,
          scores: {
            골밑슛: { status: 'exempt', value: null, display: null },
            셔틀런: { status: 'recorded', value: 95, display: '1:35' },
          },
        },
      ],
    },
  ],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

describe('Players', () => {
  it('로딩 중에는 스피너를 보여준다', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    renderPlayers()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('에러면 ErrorPanel을 보여주고, 재시도 버튼이 refetch를 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { message: '접근 권한이 없습니다' }))
    vi.stubGlobal('fetch', fetchMock)

    renderPlayers()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('접근 권한이 없습니다')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('sessions·events가 0건이면 빈 상태를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, EMPTY_BODY)))

    renderPlayers()

    await waitFor(() => expect(screen.getByText('아직 기록된 회차가 없습니다')).toBeInTheDocument())
  })

  it('기본 선택(첫 선수·최신 회차·첫 종목 카드 확장)을 렌더한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderPlayers()

    // 선수 트리거 = 선수1, 최신 회차(2차) 칩 활성
    await waitFor(() => expect(screen.getByRole('button', { name: '선수1' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '2차' })).toHaveAttribute('aria-pressed', 'true')

    // 레이더 + 첫 종목(골밑슛) 카드 확장 → 추이 차트 노출
    expect(screen.getByRole('img', { name: /종목 프로필 레이더/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '골밑슛 추이' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '셔틀런 추이' })).not.toBeInTheDocument()

    // 2차 델타 — 골밑슛 개선(▲ 2), 셔틀런 개선(시간, ▲ 10초)
    expect(screen.getByText('▲ 2')).toBeInTheDocument()
    expect(screen.getByText('▲ 10초')).toBeInTheDocument()
  })

  it('선수를 바꾸면 값이 갱신된다(면제 현재값·해당 회차 델타)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderPlayers()
    await waitFor(() => expect(screen.getByRole('button', { name: '선수1' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '선수1' }))
    fireEvent.click(screen.getByRole('option', { name: '선수2' }))

    // 선수2 · 2차: 골밑슛 면제 → 현재값 "면제" + 델타 없음, 셔틀런 개선 ▲ 5초
    expect(screen.getByRole('button', { name: '선수2' })).toBeInTheDocument()
    expect(screen.getByText('면제')).toBeInTheDocument()
    expect(screen.getByText('▲ 5초')).toBeInTheDocument()
  })

  it('회차 칩을 바꾸면 첫 기록 회차의 델타가 "—"가 된다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderPlayers()
    await waitFor(() => expect(screen.getByRole('button', { name: '2차' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '1차' }))

    // 1차는 두 종목 모두 첫 유효 기록 → 델타 "—" 두 개, 현재값은 1차 값
    expect(screen.getByRole('button', { name: '1차' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('다른 종목 카드를 탭하면 그 카드로 추이 차트가 옮겨간다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderPlayers()
    await waitFor(() => expect(screen.getByRole('img', { name: '골밑슛 추이' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /셔틀런/ }))

    expect(screen.getByRole('img', { name: '셔틀런 추이' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '골밑슛 추이' })).not.toBeInTheDocument()
  })
})
