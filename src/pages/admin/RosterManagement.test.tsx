// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import RosterManagement from './RosterManagement'
import { RECORDS_QUERY_KEY } from '../../hooks/useRecords'
const base = { generatedAt: '2026-09-30', players: [], events: [], sessions: [], rankings: [], home: { latestSession: null, achievementRates: [] } }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(RECORDS_QUERY_KEY, base)
  render(<QueryClientProvider client={client}><MemoryRouter><RosterManagement /></MemoryRouter></QueryClientProvider>)
  return client
}
it('registers without a session and refreshes roster, leaving session membership empty', async () => {
  const updated = { ...base, players: [{ id: 1, name: '신규', status: '활동', trends: [], personalBests: [] }] }
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ name: '신규' }, { status: 201 })).mockResolvedValueOnce(Response.json(updated))
  vi.stubGlobal('fetch', fetchMock)
  const client = setup()
  expect(screen.getByRole('button', { name: '팀원 등록' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('새 팀원 이름'), { target: { value: '신규' } })
  fireEvent.click(screen.getByRole('button', { name: '팀원 등록' }))
  expect(await screen.findByText('신규')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('팀원을 등록했어요')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/roster')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: '신규' })
  expect(client.getQueryData(RECORDS_QUERY_KEY)).toEqual(updated)
  expect(screen.getByRole('link', { name: /회차별 참가자 추가/ })).toHaveAttribute('href', '/admin/add-players')
})
it('keeps input on failure and blocks repeat submissions while pending', async () => {
  let finish!: (response: Response) => void
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  setup()
  fireEvent.change(screen.getByLabelText('새 팀원 이름'), { target: { value: '중복' } })
  fireEvent.click(screen.getByRole('button', { name: '팀원 등록' }))
  expect(screen.getByRole('button', { name: '등록하는 중…' })).toBeDisabled()
  expect(fetchMock).toHaveBeenCalledOnce()
  finish(Response.json({ message: '이미 등록된 이름입니다.' }, { status: 409 }))
  expect(await screen.findByRole('alert')).toHaveTextContent('이미 등록된 이름입니다.')
  expect(screen.getByLabelText('새 팀원 이름')).toHaveValue('중복')
  await waitFor(() => expect(screen.getByRole('button', { name: '팀원 등록' })).toBeEnabled())
})
