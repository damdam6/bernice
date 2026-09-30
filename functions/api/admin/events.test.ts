import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), sheets: vi.fn(), write: vi.fn(), purge: vi.fn() }))
vi.mock('../../lib/sheetsApi', async (original) => ({ ...await original<typeof import('../../lib/sheetsApi')>(), fetchSheetBundle: mocks.fetch, getSpreadsheetSheets: mocks.sheets }))
vi.mock('../../lib/sheetsWriteApi', () => ({ batchUpdate: mocks.write }))
vi.mock('../../lib/records-cache', () => ({ purgeRecordsCache: mocks.purge }))
const { onRequestPost } = await import('./events')
function context(body: unknown) {
  return { request: new Request('https://app.test/api/admin/events', { method: 'POST', body: JSON.stringify(body) }), env: { SHEET_ID: 'test' } } as Parameters<typeof onRequestPost>[0]
}
const body = { action: 'create', name: '패스', target: '3', maxScore: 5, valueKind: 'count', direction: '높을수록', exemptable: false }
beforeEach(() => {
  mocks.fetch.mockResolvedValue({ roster: { name: '버니스명단', values: [['이름', '상태']] }, goals: { name: '목표', values: [['종목', '목표', '만점', '방향', '종료 회차', '면제 가능', '종목 ID']] }, rounds: [], unclassified: [] })
  mocks.sheets.mockResolvedValue([{ title: '목표', sheetId: 5 }])
  mocks.write.mockResolvedValue({}); mocks.purge.mockResolvedValue(true)
})
afterEach(() => vi.resetAllMocks())
it('검증된 신규 종목을 재시도 없이 추가하고 캐시 삭제 후 응답한다', async () => {
  const res = await onRequestPost(context(body))
  expect(res.status).toBe(201)
  expect((await res.json() as { id: string }).id).toMatch(/^[a-f0-9-]{36}$/)
  expect(mocks.write).toHaveBeenCalledWith(expect.anything(), 'test', expect.any(Array), false)
  expect(mocks.purge).toHaveBeenCalledOnce()
})
it('잘못된 입력은 시트 접근 없이 거절한다', async () => {
  expect((await onRequestPost(context({ ...body, target: '9' }))).status).toBe(400)
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled()
})
it('미이전 시트에 쓰지 않는다', async () => {
  mocks.fetch.mockResolvedValue({ goals: { name: '목표', values: [['종목', '목표', '만점', '방향', '종료 회차']] }, rounds: [] })
  expect((await onRequestPost(context(body))).status).toBe(409)
  expect(mocks.write).not.toHaveBeenCalled()
})
it('상위 쓰기 실패를 성공으로 보고하지 않는다', async () => {
  const { SheetsApiError } = await import('../../lib/sheetsApi')
  mocks.write.mockRejectedValue(new SheetsApiError('failed', 503))
  const res = await onRequestPost(context(body))
  expect(res.status).toBe(502)
  expect(await res.text()).toContain('반영 여부')
  expect(mocks.purge).not.toHaveBeenCalled()
})
it('예상하지 못한 내부 오류 메시지는 응답에 노출하지 않는다', async () => {
  mocks.fetch.mockRejectedValue(new Error('private internal detail'))
  const res = await onRequestPost(context(body))
  expect(res.status).toBe(500)
  const text = await res.text()
  expect(text).not.toContain('private internal detail')
  expect(text).toContain('반영 여부')
})
