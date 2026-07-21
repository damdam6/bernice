// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecordsResponse } from '../../shared/domain'
import Home from './Home'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function renderHome() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// value+단위가 별도 엘리먼트로 쪼개져 있어(예: "5"+<span>명</span>) getByText 문자열로는
// 잡히지 않는다 — 엘리먼트 전체 textContent 일치로 좁히는 매처.
function wholeText(text: string) {
  return (_: string, element: Element | null) => element?.textContent === text
}

const EMPTY_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: [],
  players: [],
  sessions: [],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

// 종목 2개 × 회차 3개(최신 = 3차). 게이지: 골밑슛 3/6(0.5) · 셔틀런 6/6(1.0) → 평균 75%.
const RECORDS_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: [
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
    { key: '셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
  ],
  players: [{ id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] }],
  sessions: [
    { date: '2026-06-01', entries: [] },
    { date: '2026-06-08', entries: [] },
    { date: '2026-06-15', entries: [] },
  ],
  rankings: [],
  home: {
    latestSession: { date: '2026-06-15', participantCount: 5 },
    achievementRates: [
      { event: '골밑슛', achievedCount: 3, eligibleCount: 6, rate: 0.5 },
      { event: '셔틀런', achievedCount: 6, eligibleCount: 6, rate: 1 },
    ],
  },
}

describe('Home', () => {
  it('로딩 중에는 스피너를 보여준다', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    renderHome()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('latestSession=null이면 빈 상태를 보여주되 헤더(관리자 로그인)는 유지한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, EMPTY_BODY)))

    renderHome()

    await waitFor(() => expect(screen.getByText('아직 기록된 회차가 없습니다')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '관리자 로그인' })).toHaveAttribute('href', '/admin/login')
  })

  it('실데이터로 최신 회차 요약 + 종목별 게이지 + 바로가기를 렌더한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderHome()

    // 인디고 카드 — n차 파생(3차) · 날짜 · 참여인원 · 평균%(75) 파생
    await waitFor(() => expect(screen.getByText('최신 회차 · 3차')).toBeInTheDocument())
    expect(screen.getByText('2026-06-15')).toBeInTheDocument()
    expect(screen.getByText(wholeText('5명'))).toBeInTheDocument()
    expect(screen.getByText('참여 인원')).toBeInTheDocument()
    expect(screen.getByText(wholeText('75%'))).toBeInTheDocument()
    expect(screen.getByText('평균 목표 달성')).toBeInTheDocument()

    // 종목별 게이지 — 라벨 + "n/m명 달성" + 달성률 게이지(role=img, aria-label %)
    expect(screen.getByText('골밑슛')).toBeInTheDocument()
    expect(screen.getByText('셔틀런')).toBeInTheDocument()
    expect(screen.getByText('3/6명 달성')).toBeInTheDocument()
    expect(screen.getByText('6/6명 달성')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '달성률 50%' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '달성률 100%' })).toBeInTheDocument()

    // 바로가기 2카드 — 목적지 검증
    expect(screen.getByRole('link', { name: /랭킹/ })).toHaveAttribute('href', '/rankings')
    expect(screen.getByRole('link', { name: /개인 추이/ })).toHaveAttribute('href', '/players')
  })

  it('P0 스캐폴딩 스텁(문구·/api/health)을 더 이상 렌더하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY))
    vi.stubGlobal('fetch', fetchMock)

    renderHome()

    await waitFor(() => expect(screen.getByText('최신 회차 · 3차')).toBeInTheDocument())
    expect(screen.queryByText(/P0 스캐폴딩/)).not.toBeInTheDocument()
    // 홈은 /api/records만 사용 — /api/health 핑 제거 확인
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('/api/health')
    }
  })
})
