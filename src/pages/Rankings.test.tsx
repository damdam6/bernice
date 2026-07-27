// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecordsResponse } from '../../shared/domain'
import Rankings from './Rankings'
import { jsonResponse } from '../test/json-response'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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
    { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null },
    { key: '셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null },
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
      eventKeys: ['골밑슛', '셔틀런'],
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
      eventKeys: ['골밑슛', '셔틀런'],
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

// 종목 7개 × 회차 2개 — 1차는 4종목만 측정(eventKeys 부분집합), 최신은 7종목 전부 측정.
// 종목 칩이 events[] 전체가 아니라 선택 회차 eventKeys만 반영하는지, 회차 전환 시
// 선택 종목이 사라지면 첫 종목으로 폴백하는지를 검증한다(#123, PRD §08 마이그레이션 시나리오).
const MIXED_EVENT_KEYS = ['골밑슛', '셔틀런', '자유투', '드리블', '패스', '던지기', '달리기']

function mixedEventDefinition(key: string) {
  return { key, valueKind: 'count' as const, target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' as const, endSessionDate: null }
}

function recordedScoresFor(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, { status: 'recorded' as const, value: 6, display: '6' }]))
}

function eventRankingsFor(keys: string[]) {
  return keys.map((key) => ({
    event: key,
    entries: [{ playerId: 1, name: '선수1', value: 6, display: '6', rank: 1, achieved: true }],
  }))
}

const MIXED_EVENT_COUNT_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: MIXED_EVENT_KEYS.map(mixedEventDefinition),
  players: [{ id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] }],
  sessions: [
    {
      date: '2026-06-01',
      entries: [{ playerId: 1, name: '선수1', participated: true, scores: recordedScoresFor(MIXED_EVENT_KEYS.slice(0, 4)) }],
      eventKeys: MIXED_EVENT_KEYS.slice(0, 4),
    },
    {
      date: '2026-06-08',
      entries: [{ playerId: 1, name: '선수1', participated: true, scores: recordedScoresFor(MIXED_EVENT_KEYS) }],
      eventKeys: MIXED_EVENT_KEYS,
    },
  ],
  rankings: [
    { sessionDate: '2026-06-01', events: eventRankingsFor(MIXED_EVENT_KEYS.slice(0, 4)) },
    { sessionDate: '2026-06-08', events: eventRankingsFor(MIXED_EVENT_KEYS) },
  ],
  home: { latestSession: null, achievementRates: [] },
}

// 회차에 eventKeys 자체가 없는(계약 위반) 방어 케이스 — sessionEvents가 비어도 크래시 없이
// 빈 상태로 수렴하는지 검증한다(#123 리뷰 코멘트).
const EMPTY_SESSION_EVENTS_BODY: RecordsResponse = {
  generatedAt: '2026-07-19T00:00:00.000Z',
  events: [mixedEventDefinition('골밑슛')],
  players: [{ id: 1, name: '선수1', status: '활동', trends: [], personalBests: [] }],
  sessions: [{ date: '2026-06-01', entries: [], eventKeys: [] }],
  rankings: [{ sessionDate: '2026-06-01', events: [] }],
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

  it('혼재 픽스처 — 1차는 4종목 칩, 최신 회차는 7종목 칩을 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, MIXED_EVENT_COUNT_BODY)))

    renderRankings()

    // 기본값: 최신 회차(2차) — eventKeys 7개가 그대로 칩 7개로
    await waitFor(() => expect(screen.getByRole('button', { name: '2차' })).toHaveAttribute('aria-pressed', 'true'))
    for (const key of MIXED_EVENT_KEYS) {
      expect(screen.getByRole('button', { name: key })).toBeInTheDocument()
    }

    // 1차로 전환 — eventKeys 4개만 칩으로 남고, 나머지 3개는 렌더되지 않는다
    fireEvent.click(screen.getByRole('button', { name: '1차' }))

    for (const key of MIXED_EVENT_KEYS.slice(0, 4)) {
      expect(screen.getByRole('button', { name: key })).toBeInTheDocument()
    }
    for (const key of MIXED_EVENT_KEYS.slice(4)) {
      expect(screen.queryByRole('button', { name: key })).not.toBeInTheDocument()
    }
  })

  it('회차 전환 시 선택 종목이 새 회차에 없으면 첫 종목으로 폴백한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, MIXED_EVENT_COUNT_BODY)))

    renderRankings()

    // 최신 회차(2차)에서 1차엔 없는 종목(달리기, 7번째)을 선택
    await waitFor(() => expect(screen.getByRole('button', { name: '2차' })).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(screen.getByRole('button', { name: '달리기' }))
    expect(screen.getByRole('button', { name: '달리기' })).toHaveAttribute('aria-pressed', 'true')

    // 1차로 전환 — 달리기 칩 자체가 사라지고, 선택은 1차의 첫 종목(골밑슛)으로 폴백
    fireEvent.click(screen.getByRole('button', { name: '1차' }))

    expect(screen.queryByRole('button', { name: '달리기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '골밑슛' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('선택 회차에 eventKeys가 없으면(계약 위반 데이터) 크래시 없이 빈 상태를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, EMPTY_SESSION_EVENTS_BODY)))

    renderRankings()

    await waitFor(() => expect(screen.getByText('표시할 기록이 없습니다')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '골밑슛' })).not.toBeInTheDocument()
  })
})
