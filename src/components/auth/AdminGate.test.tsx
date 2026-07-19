// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { RecordsResponse } from '../../../shared/domain'
import { AdminGate } from './AdminGate'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const RECORDS_BODY: RecordsResponse = {
  generatedAt: '2026-07-17T00:00:00.000Z',
  events: [],
  players: [],
  sessions: [],
  rankings: [],
  home: { latestSession: null, achievementRates: [] },
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin/login" element={<p>관리자 로그인 스텁</p>} />
          <Route element={<AdminGate />}>
            <Route path="/admin" element={<p>시트 관리 스텁</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminGate', () => {
  it('로딩 중엔 스피너만 노출한다', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    renderGate()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('시트 관리 스텁')).not.toBeInTheDocument()
  })

  it('401이면 /admin/login으로 리다이렉트한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' })))

    renderGate()

    expect(await screen.findByText('관리자 로그인 스텁')).toBeInTheDocument()
    expect(screen.queryByText('시트 관리 스텁')).not.toBeInTheDocument()
  })

  it('200이면 게이트를 통과해 자식 라우트를 렌더한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderGate()

    expect(await screen.findByText('시트 관리 스텁')).toBeInTheDocument()
  })

  it('401이 아닌 에러(예: 5xx)면 공통 에러 화면을 노출한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '서버 오류' })),
    )

    renderGate()

    expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류')
    expect(screen.queryByText('시트 관리 스텁')).not.toBeInTheDocument()
  })

  it('에러 화면의 다시 시도 버튼을 누르면 재조회한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '서버 오류' }))
    vi.stubGlobal('fetch', fetchMock)

    renderGate()

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
