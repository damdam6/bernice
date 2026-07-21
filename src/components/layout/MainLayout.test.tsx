// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MainLayout } from './MainLayout'

afterEach(cleanup)

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<p>홈 스텁</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('MainLayout', () => {
  it('Outlet 콘텐츠를 중앙정렬 프레임 안에 렌더한다(#107)', () => {
    renderApp()

    const frame = screen.getByText('홈 스텁').parentElement
    expect(frame).toHaveClass('mx-auto', 'w-full', 'max-w-frame')
  })

  it('하단 네비를 함께 노출한다', () => {
    renderApp()

    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })
})
