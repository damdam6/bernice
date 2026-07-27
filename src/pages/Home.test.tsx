// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null },
    { key: '셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null },
  ],
  players: [{ id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] }],
  sessions: [
    { date: '2026-06-01', entries: [], eventKeys: ['골밑슛', '셔틀런'] },
    { date: '2026-06-08', entries: [], eventKeys: ['골밑슛', '셔틀런'] },
    { date: '2026-06-15', entries: [], eventKeys: ['골밑슛', '셔틀런'] },
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

// 종료 종목(#124) — 과거 회차엔 있었으나 최신 회차 eventKeys엔 없는 종목. achievementRates가 이미
// 최신 회차만 담아 오므로(computeHomeSummary), 게이지 목록도 종료 종목 없이 현역 1개만 그려야 한다.
const ENDED_EVENT_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: [
    {
      key: '오래된종목',
      valueKind: 'count',
      target: '5',
      targetValue: 5,
      maxScore: 10,
      direction: '높을수록',
      endSessionDate: '2026-06-08',
    },
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null },
  ],
  players: [{ id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] }],
  sessions: [
    { date: '2026-06-01', entries: [], eventKeys: ['오래된종목', '골밑슛'] },
    { date: '2026-06-08', entries: [], eventKeys: ['오래된종목', '골밑슛'] },
    { date: '2026-06-15', entries: [], eventKeys: ['골밑슛'] },
  ],
  rankings: [],
  home: {
    latestSession: { date: '2026-06-15', participantCount: 4 },
    achievementRates: [{ event: '골밑슛', achievedCount: 2, eligibleCount: 4, rate: 0.5 }],
  },
}

// 7종목(#124) — GaugeList는 랭킹 칩과 달리 세로 목록(가로 스크롤 아님)이라 폴백 로직은 없지만,
// 7행이 achievementRates 순서·개수 그대로 무너지지 않는지는 회귀로 잡아둔다.
const SEVEN_EVENTS = ['종목A', '종목B', '종목C', '종목D', '종목E', '종목F', '종목G']
const SEVEN_EVENTS_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: SEVEN_EVENTS.map((key) => ({
    key,
    valueKind: 'count' as const,
    target: '5',
    targetValue: 5,
    maxScore: 10,
    direction: '높을수록' as const,
    endSessionDate: null,
  })),
  players: [{ id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] }],
  sessions: [{ date: '2026-06-15', entries: [], eventKeys: SEVEN_EVENTS }],
  rankings: [],
  home: {
    latestSession: { date: '2026-06-15', participantCount: 7 },
    achievementRates: SEVEN_EVENTS.map((event, index) => ({
      event,
      achievedCount: index + 1,
      eligibleCount: 7,
      rate: (index + 1) / 7,
    })),
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

  it('혼재 픽스처 — 종료 종목은 최신 회차 게이지에 나타나지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, ENDED_EVENT_BODY)))

    renderHome()

    await waitFor(() => expect(screen.getByText('골밑슛')).toBeInTheDocument())
    expect(screen.getByText('2/4명 달성')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(1)

    // 목표 탭엔 여전히 존재하는(events[]) 종료 종목이 게이지엔 안 보여야 한다
    expect(screen.queryByText('오래된종목')).not.toBeInTheDocument()
  })

  it('7종목이면 게이지 7행이 achievementRates 순서·개수 그대로 렌더된다 (레이아웃 회귀)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, SEVEN_EVENTS_BODY)))

    const { container } = renderHome()

    await waitFor(() => expect(screen.getByText('종목별 팀 목표 달성률')).toBeInTheDocument())

    const gauges = screen.getAllByRole('img')
    expect(gauges).toHaveLength(7)

    const section = screen.getByText('종목별 팀 목표 달성률').closest('section')
    expect(section).not.toBeNull()
    const labels = within(section as HTMLElement).getAllByText(/^종목[A-G]$/)
    expect(labels.map((label) => label.textContent)).toEqual(SEVEN_EVENTS)

    SEVEN_EVENTS.forEach((_, index) => {
      const pct = Math.round(((index + 1) / 7) * 100)
      expect(gauges[index]).toHaveAccessibleName(`달성률 ${pct}%`)
    })
    expect(screen.getByText('1/7명 달성')).toBeInTheDocument()
    expect(screen.getByText('7/7명 달성')).toBeInTheDocument()

    // 게이지 목록이 길어져도 뒤 섹션(바로가기)이 밀려나거나 사라지지 않는다
    expect(container.querySelector('section:last-of-type')).not.toBeNull()
    expect(screen.getByRole('link', { name: /랭킹/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /개인 추이/ })).toBeInTheDocument()
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
