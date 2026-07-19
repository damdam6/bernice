// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { RecordsResponse } from '../../../shared/domain'
import { LoginGate } from './LoginGate'

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
  // retry/refetchOnWindowFocus 끔 — records 쿼리는 자체 retry(shouldRetryRecordsQuery)를
  // 명시적으로 지정해 이 기본값을 어차피 덮어쓰지만, 다른 훅이 이 파일에 섞여도 안전하게
  // 관례적으로 꺼둔다.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<LoginGate />}>
            <Route path="/" element={<p>홈 스텁</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginGate', () => {
  it('로딩 중엔 스피너만 노출하고 게이트·데이터 화면은 노출하지 않는다', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    renderGate()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('홈 스텁')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '팀원 전용 열람' })).not.toBeInTheDocument()
  })

  it('401이면 게이트 화면만 노출하고 데이터 화면은 노출하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' })))

    renderGate()

    expect(await screen.findByRole('heading', { name: '팀원 전용 열람' })).toBeInTheDocument()
    expect(screen.queryByText('홈 스텁')).not.toBeInTheDocument()
  })

  it('200이면 게이트 없이 원래 라우트 콘텐츠를 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, RECORDS_BODY)))

    renderGate()

    expect(await screen.findByText('홈 스텁')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '팀원 전용 열람' })).not.toBeInTheDocument()
  })

  it('정답 코드 제출 → 게이트가 해제되고 원래 화면으로 복귀한다', async () => {
    let authorized = false
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/login') {
          authorized = true
          return Promise.resolve(jsonResponse(200, { ok: true, role: 'team' }))
        }
        return Promise.resolve(
          authorized ? jsonResponse(200, RECORDS_BODY) : jsonResponse(401, { error: 'unauthorized' }),
        )
      }),
    )

    renderGate()

    const input = await screen.findByLabelText('팀 패스코드')
    fireEvent.change(input, { target: { value: 'team-passcode-1234' } })
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }))

    expect(await screen.findByText('홈 스텁')).toBeInTheDocument()
  })

  it('오답 코드 제출 → 에러 메시지를 노출하고 게이트를 유지한다(재시도 가능)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/login') {
          return Promise.resolve(
            jsonResponse(401, { error: 'invalid_passcode', message: '패스코드가 올바르지 않습니다.' }),
          )
        }
        return Promise.resolve(jsonResponse(401, { error: 'unauthorized' }))
      }),
    )

    renderGate()

    const input = await screen.findByLabelText('팀 패스코드')
    fireEvent.change(input, { target: { value: 'wrong-code' } })
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('패스코드가 올바르지 않습니다.')
    expect(screen.getByRole('heading', { name: '팀원 전용 열람' })).toBeInTheDocument()
    expect(input).toHaveValue('wrong-code')
  })

  it('401이 아닌 에러(예: 403)면 공통 에러 화면을 노출하고 데이터·게이트 화면은 노출하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' })),
    )

    renderGate()

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
    expect(screen.queryByText('홈 스텁')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '팀원 전용 열람' })).not.toBeInTheDocument()
  })

  it('에러 화면의 다시 시도 버튼을 누르면 재조회한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, { error: 'forbidden', message: '권한이 없습니다.' }))
    vi.stubGlobal('fetch', fetchMock)

    renderGate()

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('네트워크 오류 시 일반 에러 메시지를 노출한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/login') return Promise.reject(new TypeError('Failed to fetch'))
        return Promise.resolve(jsonResponse(401, { error: 'unauthorized' }))
      }),
    )

    renderGate()

    const input = await screen.findByLabelText('팀 패스코드')
    fireEvent.change(input, { target: { value: 'team-passcode-1234' } })
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '네트워크 오류로 로그인에 실패했어요. 다시 시도해주세요.',
    )
  })
})
