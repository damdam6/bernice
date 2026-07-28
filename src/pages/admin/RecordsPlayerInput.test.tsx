// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { EventDefinition, EventScore, RecordsResponse, Session, SessionEntry } from '../../../shared/domain'
import RecordsPlayerInput from './RecordsPlayerInput'
import { jsonResponse } from '../../test/json-response'
import { expectFrameAlignedBottomBar } from '../../test/frame-aligned-bottom-bar'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function event(
  key: string,
  valueKind: 'count' | 'time',
  maxScore: number | null = null,
  endSessionDate: string | null = null,
): EventDefinition {
  return { key, valueKind, target: '0', targetValue: 0, maxScore, direction: '높을수록', endSessionDate }
}

// 2026-07 종목 개편(#126) 시나리오 — 45도패스캐치(종료)를 패스 3종 + 볼 캐치가 이었다. events[]는
// 종료 종목까지 포함한 전역 목록이라(shared/domain.ts:45-46), 종료 종목을 맨 뒤에 둔다(§10).
const ACTIVE_EVENTS: EventDefinition[] = [
  event('드리블셔틀런', 'time'),
  event('골밑슛', 'count', 10),
  event('자유투', 'count', 5),
  event('패스 - 체스트', 'count', 5),
  event('패스 - 바운드', 'count', 5),
  event('패스 - 원핸드', 'count', 5),
  event('볼 캐치', 'count', 10),
]
const ENDED_EVENT = event('45도패스캐치', 'count', 7, '2025-05-16')
const ALL_EVENTS: EventDefinition[] = [...ACTIVE_EVENTS, ENDED_EVENT]

const OLD_EVENT_KEYS = ['드리블셔틀런', '골밑슛', '자유투', '45도패스캐치']
const NEW_EVENT_KEYS = ACTIVE_EVENTS.map((e) => e.key)

const UNMEASURED: EventScore = { status: 'unmeasured', value: null, display: null }

function scoresFor(eventKeys: string[], overrides: Record<string, EventScore> = {}): Record<string, EventScore> {
  const base: Record<string, EventScore> = {}
  for (const key of eventKeys) base[key] = UNMEASURED
  return { ...base, ...overrides }
}

function makeEntry(scores: Record<string, EventScore>): SessionEntry {
  return { playerId: 7, name: '선수7', scores, participated: true }
}

function makeSession(date: string, entries: SessionEntry[], eventKeys: string[]): Session {
  return { date, entries, eventKeys }
}

function baseData(overrides: Partial<RecordsResponse> = {}): RecordsResponse {
  return {
    generatedAt: '2026-07-19T00:00:00.000Z',
    events: ALL_EVENTS,
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

function renderPage(initialPath: string, fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/admin/records/:sessionDate/:playerId" element={<RecordsPlayerInput />} />
          <Route path="/admin/records/:sessionDate" element={<RecordsParticipantsStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function recordsFetchMock(data: RecordsResponse) {
  return vi.fn().mockResolvedValue(jsonResponse(200, data))
}

describe('RecordsPlayerInput', () => {
  it('회차를 찾을 수 없으면 안내를 보여준다', async () => {
    const data = baseData({ sessions: [] })
    renderPage('/admin/records/2025-08-16/7', recordsFetchMock(data))

    expect(await screen.findByText('회차를 찾을 수 없습니다')).toBeInTheDocument()
  })

  it('참가자를 찾을 수 없으면 안내를 보여준다', async () => {
    const session = makeSession('2025-08-16', [], NEW_EVENT_KEYS)
    const data = baseData({ sessions: [session] })
    renderPage('/admin/records/2025-08-16/7', recordsFetchMock(data))

    expect(await screen.findByText('참가자를 찾을 수 없습니다')).toBeInTheDocument()
  })

  it('과거 4종목 회차 — 그 회차 eventKeys만 렌더하고, 전역에만 있는 신규 종목 필드는 새지 않는다', async () => {
    const entry = makeEntry(scoresFor(OLD_EVENT_KEYS))
    const data = baseData({ sessions: [makeSession('2025-05-16', [entry], OLD_EVENT_KEYS)] })
    renderPage('/admin/records/2025-05-16/7', recordsFetchMock(data))

    expect(await screen.findByText('선수7')).toBeInTheDocument()
    expect(screen.getByLabelText('드리블셔틀런 분')).toBeInTheDocument()
    expect(screen.getByLabelText('골밑슛 개수')).toBeInTheDocument()
    expect(screen.getByLabelText('자유투 개수')).toBeInTheDocument()
    expect(screen.getByLabelText('45도패스캐치 개수')).toBeInTheDocument()

    // 전역 events[]엔 있지만 이 회차 eventKeys 밖인 신규 종목 필드는 새지 않는다.
    expect(screen.queryByLabelText('패스 - 체스트 개수')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('패스 - 바운드 개수')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('패스 - 원핸드 개수')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('볼 캐치 개수')).not.toBeInTheDocument()

    // 종료 종목이라 이제 면제 불가 — 토글 자체가 없다.
    expect(screen.queryByRole('switch', { name: '45도패스캐치 면제' })).not.toBeInTheDocument()
  })

  it('신규 7종목 회차 — 헤더 순서대로 전 종목이 렌더되고, 패스 3종에만 면제 토글이 노출된다', async () => {
    const entry = makeEntry(scoresFor(NEW_EVENT_KEYS))
    const data = baseData({ sessions: [makeSession('2026-07-23', [entry], NEW_EVENT_KEYS)] })
    renderPage('/admin/records/2026-07-23/7', recordsFetchMock(data))

    expect(await screen.findByText('선수7')).toBeInTheDocument()

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(NEW_EVENT_KEYS)

    for (const key of ['패스 - 체스트', '패스 - 바운드', '패스 - 원핸드']) {
      expect(screen.getByRole('switch', { name: `${key} 면제` })).toBeInTheDocument()
    }
    expect(screen.queryByRole('switch', { name: '볼 캐치 면제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '골밑슛 면제' })).not.toBeInTheDocument()

    // 종료 종목(45도패스캐치)은 이 회차 eventKeys 밖이라 아예 렌더되지 않는다.
    expect(screen.queryByLabelText('45도패스캐치 개수')).not.toBeInTheDocument()
  })

  it('정상값·면제·미측정을 각 타입별 입력기에 프리필한다', async () => {
    const entry = makeEntry(
      scoresFor(NEW_EVENT_KEYS, {
        드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
        골밑슛: { status: 'recorded', value: 6, display: '6' },
        '패스 - 체스트': { status: 'exempt', value: null, display: null },
      }),
    )
    const data = baseData({ sessions: [makeSession('2026-07-23', [entry], NEW_EVENT_KEYS)] })
    renderPage('/admin/records/2026-07-23/7', recordsFetchMock(data))

    expect(await screen.findByText('선수7')).toBeInTheDocument()
    expect(screen.getByText('1차 · 2026-07-23')).toBeInTheDocument()

    expect(screen.getByLabelText('드리블셔틀런 분')).toHaveValue('1')
    expect(screen.getByLabelText('드리블셔틀런 초')).toHaveValue('12')
    expect(screen.getByLabelText('골밑슛 개수')).toHaveValue('6')
    expect(screen.getByLabelText('자유투 개수')).toHaveValue('')

    // 패스 - 체스트만 면제 토글이 있고, 켜져 있으며, 값 입력부는 숨겨진다.
    const exemptToggle = screen.getByRole('switch', { name: '패스 - 체스트 면제' })
    expect(exemptToggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('패스 - 체스트 개수')).not.toBeInTheDocument()

    // 면제 가능하지 않은 종목엔 토글 자체가 없다.
    expect(screen.queryByRole('switch', { name: '골밑슛 면제' })).not.toBeInTheDocument()
  })

  it('기존 값이 invalid면 필드를 비우고 원본·사유를 안내한다', async () => {
    const entry = makeEntry(
      scoresFor(NEW_EVENT_KEYS, {
        드리블셔틀런: { status: 'invalid', value: null, display: '1:75', reason: '초 값이 범위를 벗어남 (0-59)' },
      }),
    )
    const data = baseData({ sessions: [makeSession('2026-07-23', [entry], NEW_EVENT_KEYS)] })
    renderPage('/admin/records/2026-07-23/7', recordsFetchMock(data))

    expect(await screen.findByLabelText('드리블셔틀런 분')).toHaveValue('')
    expect(screen.getByLabelText('드리블셔틀런 초')).toHaveValue('')
    expect(screen.getByText(/기존 값 안내.*1:75.*초 값이 범위를 벗어남/)).toBeInTheDocument()
  })

  it('초가 0-59를 벗어나면 인라인 에러를 보여주고 저장 버튼을 비활성화한다', async () => {
    const entry = makeEntry(scoresFor(NEW_EVENT_KEYS))
    const data = baseData({ sessions: [makeSession('2026-07-23', [entry], NEW_EVENT_KEYS)] })
    renderPage('/admin/records/2026-07-23/7', recordsFetchMock(data))

    await screen.findByText('선수7')
    fireEvent.change(screen.getByLabelText('드리블셔틀런 분'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('드리블셔틀런 초'), { target: { value: '75' } })

    expect(screen.getByRole('alert')).toHaveTextContent('초 값이 범위를 벗어남')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('면제 토글을 켜면 값 입력부가 숨겨지고, 끄면 다시 보인다', async () => {
    const entry = makeEntry(scoresFor(NEW_EVENT_KEYS))
    const data = baseData({ sessions: [makeSession('2026-07-23', [entry], NEW_EVENT_KEYS)] })
    renderPage('/admin/records/2026-07-23/7', recordsFetchMock(data))

    await screen.findByText('선수7')
    const toggle = screen.getByRole('switch', { name: '패스 - 체스트 면제' })

    expect(screen.getByLabelText('패스 - 체스트 개수')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('패스 - 체스트 개수')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('패스 - 체스트 개수')).toBeInTheDocument()
  })

  it('저장 성공 → 참가자 목록으로 이동하며 토스트 메시지를 넘긴다', async () => {
    const entry = makeEntry(scoresFor(NEW_EVENT_KEYS))
    const data = baseData({ sessions: [makeSession('2026-07-23', [entry], NEW_EVENT_KEYS)] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/records') {
        return Promise.resolve(
          jsonResponse(200, { sessionDate: '2026-07-23', playerId: 7, name: '선수7', scores: {} }),
        )
      }
      return Promise.resolve(jsonResponse(200, data))
    })
    renderPage('/admin/records/2026-07-23/7', fetchMock)

    await screen.findByText('선수7')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText(/참가자 목록 스텁/)).toBeInTheDocument()
    expect(screen.getByText(/선수7 저장됨/)).toBeInTheDocument()
  })

  it('저장 실패(502) → 에러 문구를 보여주고 입력값을 보존한다', async () => {
    const entry = makeEntry(scoresFor(NEW_EVENT_KEYS))
    const data = baseData({ sessions: [makeSession('2026-07-23', [entry], NEW_EVENT_KEYS)] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/records') {
        return Promise.resolve(jsonResponse(502, { error: 'sheets_api_error', message: 'Sheets API 오류' }))
      }
      return Promise.resolve(jsonResponse(200, data))
    })
    renderPage('/admin/records/2026-07-23/7', fetchMock)

    await screen.findByText('선수7')
    fireEvent.change(screen.getByLabelText('골밑슛 개수'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sheets API 오류')
    expect(screen.getByLabelText('골밑슛 개수')).toHaveValue('6')
    expect(screen.queryByText(/참가자 목록 스텁/)).not.toBeInTheDocument()
  })

  it('에러 응답이면 에러 패널을 노출한다', async () => {
    renderPage(
      '/admin/records/2025-08-16/7',
      vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' })),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  })

  it('하단 저장 바가 전폭이 아니라 프레임 폭에 중앙정렬된다(#156)', async () => {
    const entry = makeEntry(scoresFor(NEW_EVENT_KEYS))
    const data = baseData({ sessions: [makeSession('2025-08-16', [entry], NEW_EVENT_KEYS)] })
    renderPage('/admin/records/2025-08-16/7', recordsFetchMock(data))

    expectFrameAlignedBottomBar(await screen.findByRole('button', { name: '저장' }))
  })
})
