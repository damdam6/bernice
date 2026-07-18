// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'

afterEach(cleanup)

function renderApp(initialEntries: string[], initialIndex: number) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/" element={<p>홈 스텁</p>} />
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<p>관리자 스텁</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminLayout', () => {
  it('하단 네비 없이 뒤로가기 버튼만 노출한다', () => {
    renderApp(['/admin'], 0)

    expect(screen.getByRole('button', { name: /뒤로/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('뒤로가기 버튼 클릭 시 이전 경로로 이동한다', () => {
    renderApp(['/', '/admin'], 1)

    expect(screen.getByText('관리자 스텁')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /뒤로/ }))

    expect(screen.getByText('홈 스텁')).toBeInTheDocument()
  })
})
