// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecordsResponse } from '../../shared/domain'
import Rankings from './Rankings'

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

function renderRankings() {
  return render(<Rankings />, { wrapper: createWrapper() })
}

const EMPTY_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: [],
  players: [],
  sessions: [],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

// 종목 2개(개수+만점 있음 / 시간+만점 없음) × 회차 2개(과거·최신), 순위권 + 면제/미측정
// 보충이 섞이도록 구성 — buildRankingRows/buildEventGuidance 배선을 화면 단위로 검증한다.
const RECORDS_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: [
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
    { key: '셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
  ],
  players: [
    { id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] },
    { id: 2, name: '선수2', status: '활동', trends: [], personalBests: [] },
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
            골밑슛: { status: 'exempt', value: null, display: null },
            셔틀런: { status: 'recorded', value: 70, display: '1:10' },
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
            셔틀런: { status: 'recorded', value: 60, display: '1:00' },
          },
        },
        {
          playerId: 2,
          name: '선수2',
          participated: true,
          scores: {
            골밑슛: { status: 'unmeasured', value: null, display: null },
            셔틀런: { status: 'recorded', value: 65, display: '1:05' },
          },
        },
      ],
    },
  ],
  rankings: [
    {
      sessionDate: '2026-06-01',
      events: [
        { event: '골밑슛', entries: [{ playerId: 1, name: '선수1', value: 6, display: '6', rank: 1, achieved: true }] },
        {
          event: '셔틀런',
          entries: [
            { playerId: 2, name: '선수2', value: 70, display: '1:10', rank: 1, achieved: true },
            { playerId: 1, name: '선수1', value: 90, display: '1:30', rank: 2, achieved: false },
          ],
        },
      ],
    },
    {
      sessionDate: '2026-06-08',
      events: [
        { event: '골밑슛', entries: [{ playerId: 1, name: '선수1', value: 8, display: '8', rank: 1, achieved: true }] },
        {
          event: '셔틀런',
          entries: [
            { playerId: 1, name: '선수1', value: 60, display: '1:00', rank: 1, achieved: true },
            { playerId: 2, name: '선수2', value: 65, display: '1:05', rank: 2, achieved: true },
          ],
        },
      ],
    },
  ],
  home: { latestSession: null, achievementRates: [] },
}

describe('Rankings', () => {
  it('로딩 중에는 스피너를 보여준다', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    renderRankings()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('에러면 ErrorPanel을 보여주고, 재시도 버튼이 refetch를 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { message: '접근 권한이 없습니다' }))
    vi.stubGlobal('fetch', fetchMock)

    renderRankings()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('접근 권한이 없습니다')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('sessions·events가 0건이면 빈 상태를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, EMPTY_BODY)))

    renderRankings()

    await waitFor(() => expect(screen.getByText('아직 기록된 회차가 없습니다')).toBeInTheDocument())
  })

  it('기본 선택(최신 회차·첫 종목)을 렌더하고, 칩 전환 시 안내문·행 목록이 갱신된다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderRankings()

    // 기본값: 최신 회차(2차) + 첫 종목(골밑슛) — 미측정 보충 포함
    await waitFor(() => expect(screen.getByRole('button', { name: '골밑슛' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('button', { name: '2차' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('목표 5개 이상 · / 10')).toBeInTheDocument()
    expect(screen.getByText('1위')).toBeInTheDocument()
    expect(screen.getByText('8 / 10')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('미측정')).toBeInTheDocument()

    // 종목 칩 전환 → 셔틀런(같은 회차: 2차, 둘 다 recorded)
    fireEvent.click(screen.getByRole('button', { name: '셔틀런' }))

    expect(screen.getByText('목표 1:17 이내 · 낮을수록 좋음 ↓')).toBeInTheDocument()
    expect(screen.getByText('1:00')).toBeInTheDocument()
    expect(screen.getByText('1:05')).toBeInTheDocument()
    expect(screen.getAllByText('달성')).toHaveLength(2)

    // 회차 칩 전환 → 1차(종목은 셔틀런 유지) — 동점 없는 1/2위 + 미달성 뱃지 확인
    fireEvent.click(screen.getByRole('button', { name: '1차' }))

    expect(screen.getByText('1:10')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getByText('미달성')).toBeInTheDocument()
  })
})
