// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SheetManagementHome from './SheetManagementHome'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<SheetManagementHome />} />
          <Route path="/admin/records" element={<p>날짜 선택 스텁</p>} />
          <Route path="/admin/add-players" element={<p>참가자 추가 스텁</p>} />
          <Route path="/admin/create-sheet" element={<p>기록지 만들기 스텁</p>} />
          <Route path="/" element={<p>홈 스텁</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const RECORDS_BODY = {
  generatedAt: '2026-07-28T00:00:00.000Z',
  events: [],
  players: [],
  sessions: [],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

describe('SheetManagementHome', () => {
  it('버튼 4개 · 로그아웃 · 안내 박스를 노출한다', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '기록 입력' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '참가자 추가' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기록지 만들기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '데이터 새로 고침' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
    expect(screen.getByText(/시트가 SoT/)).toBeInTheDocument()
  })

  it('기록 입력 클릭 → 날짜 선택으로 이동', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '기록 입력' }))
    expect(screen.getByText('날짜 선택 스텁')).toBeInTheDocument()
  })

  it('참가자 추가 클릭 → 참가자 추가 화면으로 이동', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '참가자 추가' }))
    expect(screen.getByText('참가자 추가 스텁')).toBeInTheDocument()
  })

  it('기록지 만들기 클릭 → 기록지 만들기 화면으로 이동', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '기록지 만들기' }))
    expect(screen.getByText('기록지 만들기 스텁')).toBeInTheDocument()
  })

  it('로그아웃 클릭 → /api/logout 호출 후 홈으로 이동', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(await screen.findByText('홈 스텁')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/logout', { method: 'POST' })
  })

  it('로그아웃 API가 네트워크 오류여도 홈으로 이동한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(await screen.findByText('홈 스텁')).toBeInTheDocument()
  })

  it('데이터 새로 고침 클릭 → 엣지 퍼지 후 reload refetch 순서로 호출하고 성공 토스트를 띄운다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(RECORDS_BODY), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '데이터 새로 고침' }))

    expect(await screen.findByText('최신 데이터를 불러왔어요')).toBeInTheDocument()
    // 순서가 계약이다 — 퍼지 전에 refetch하면 엣지의 옛 응답을 브라우저 캐시에 다시 심는다.
    expect(fetchMock.mock.calls[0]).toEqual(['/api/refresh', { method: 'POST' }])
    expect(fetchMock.mock.calls[1]).toEqual(['/api/records', { signal: undefined, cache: 'reload' }])
  })

  it('새로 고침 실패 시 인라인 에러 문구를 띄우고 토스트는 띄우지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not json', { status: 502 })),
    )

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '데이터 새로 고침' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('캐시 비우기에 실패했어요. 다시 시도해주세요.')
    expect(screen.queryByText('최신 데이터를 불러왔어요')).not.toBeInTheDocument()
  })

  it('새로 고침 진행 중에는 버튼이 비활성화되고 라벨이 바뀐다', async () => {
    // 퍼지 응답을 붙들어 진행 중 상태를 고정한 뒤 UI를 검증하고, 마지막에 풀어 정리한다.
    let releasePurge!: (value: Response) => void
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => { releasePurge = resolve }))
      .mockResolvedValueOnce(new Response(JSON.stringify(RECORDS_BODY), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '데이터 새로 고침' }))

    const pending = await screen.findByRole('button', { name: '새로 고침 중…' })
    expect(pending).toBeDisabled()

    releasePurge(new Response(JSON.stringify({ deleted: true }), { status: 200 }))
    expect(await screen.findByRole('button', { name: '데이터 새로 고침' })).toBeEnabled()
  })
})
