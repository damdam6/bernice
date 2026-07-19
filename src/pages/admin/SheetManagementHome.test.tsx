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

describe('SheetManagementHome', () => {
  it('버튼 3개 · 로그아웃 · 안내 박스를 노출한다', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '기록 입력' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '참가자 추가' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기록지 만들기' })).toBeInTheDocument()
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
})
