// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminLogin from './AdminLogin'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<p>시트 관리 스텁</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminLogin', () => {
  it('관리자 코드 제출 → 시트 관리로 이동한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, role: 'admin' })))

    renderPage()

    fireEvent.change(screen.getByLabelText('관리자 코드'), { target: { value: 'admin-code-5678' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByText('시트 관리 스텁')).toBeInTheDocument()
  })

  it('오답 코드 → 에러 문구를 노출하고 화면에 머문다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid_passcode', message: '패스코드가 올바르지 않습니다.' })),
    )

    renderPage()

    fireEvent.change(screen.getByLabelText('관리자 코드'), { target: { value: 'wrong-code' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 코드가 올바르지 않습니다.')
    expect(screen.queryByText('시트 관리 스텁')).not.toBeInTheDocument()
  })

  it('유효한 팀 패스코드 입력 → 관리자 코드가 아니므로 실패로 취급한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, role: 'team' })))

    renderPage()

    fireEvent.change(screen.getByLabelText('관리자 코드'), { target: { value: 'team-passcode-1234' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 코드가 올바르지 않습니다.')
    expect(screen.queryByText('시트 관리 스텁')).not.toBeInTheDocument()
  })

  it('네트워크 오류 시 일반 에러 메시지를 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderPage()

    fireEvent.change(screen.getByLabelText('관리자 코드'), { target: { value: 'admin-code-5678' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류로 로그인에 실패했어요. 다시 시도해주세요.')
  })

  it('코드가 비어 있으면 로그인 버튼이 비활성 상태다', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled()
  })
})
