import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRoster } from '../../lib/roster'
import { buildAddPlayersPlan } from '../../lib/add-players'
const mocks = vi.hoisted(() => ({ sheets: vi.fn(), read: vi.fn(), write: vi.fn(), purge: vi.fn() }))
vi.mock('../../lib/sheetsApi', async (original) => ({ ...await original<typeof import('../../lib/sheetsApi')>(), getSpreadsheetSheets: mocks.sheets, batchGetValues: mocks.read }))
vi.mock('../../lib/sheetsWriteApi', () => ({ batchUpdate: mocks.write }))
vi.mock('../../lib/records-cache', () => ({ purgeRecordsCache: mocks.purge }))
import { onRequestPost } from './roster'
const rows = [['이름', '상태'], ['기존', '활동'], [], ['탈퇴자', '탈퇴'], ['이상행', '알수없음']]
function call(body: unknown) {
  return onRequestPost({ request: new Request('https://test/api/admin/roster', { method: 'POST', body: JSON.stringify(body) }), env: { SHEET_ID: 'book' } } as Parameters<typeof onRequestPost>[0])
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.sheets.mockResolvedValue([{ title: '버니스명단', sheetId: 42 }])
  mocks.read.mockResolvedValue([{ values: rows }])
  mocks.write.mockResolvedValue({})
})
describe('roster registration', () => {
  it.each([null, {}, { name: '' }, { name: '  ' }, { name: 1 }, { name: 'a\nb' }, { name: 'a'.repeat(101) }])('rejects invalid input %j', async (body) => {
    expect((await call(body)).status).toBe(400)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it.each(['기존', ' 탈퇴자 ', '이상행'])('blocks all existing names including retired/invalid rows: %s', async (name) => {
    expect((await call({ name })).status).toBe(409)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('appends literal values without changing old IDs; new player is selectable separately', async () => {
    const before = structuredClone(rows)
    expect((await call({ name: '  새팀원  ' })).status).toBe(201)
    const [, book, requests, retry] = mocks.write.mock.calls[0]
    expect(book).toBe('book')
    expect(retry).toBe(false)
    expect(requests).toHaveLength(2)
    expect(requests[0].addNamedRange.namedRange.namedRangeId).toBe(requests[0].addNamedRange.namedRange.name)
    expect(requests[0].addNamedRange.namedRange.name).toMatch(/^bernice_member_[a-f0-9]{64}$/)
    expect(requests[1]).toEqual({ appendCells: { sheetId: 42, rows: [{ values: [{ userEnteredValue: { stringValue: '새팀원' } }, { userEnteredValue: { stringValue: '활동' } }] }], fields: 'userEnteredValue' } })
    expect(rows).toEqual(before)
    const players = parseRoster([...rows, ['새팀원', '활동']]).players
    expect(players.slice(0, 2)).toEqual(parseRoster(rows).players)
    expect(players.at(-1)?.id).toBe(5)
    const roundValues = [['이름', '슛'], ['기존', '7']]
    const plan = buildAddPlayersPlan({ rosterName: '버니스명단', players, roundValues, playerIds: [5] })
    expect(plan.rows).toEqual([["='버니스명단'!A6"]])
    expect(roundValues).toEqual([['이름', '슛'], ['기존', '7']])
    expect(mocks.purge).toHaveBeenCalledOnce()
  })
  it('normalizes names before duplicate checks', async () => {
    mocks.read.mockResolvedValue([{ values: [['이름', '상태'], ['가', '활동']] }])
    expect((await call({ name: '가'.normalize('NFD') })).status).toBe(409)
  })
  it('does not interpret a name as a formula', async () => {
    expect((await call({ name: '=1+1' })).status).toBe(201)
    expect(mocks.write.mock.calls[0][2][1].appendCells.rows[0].values[0]).toEqual({ userEnteredValue: { stringValue: '=1+1' } })
  })
  it('handles concurrent duplicate / ambiguous commit without retry', async () => {
    mocks.write.mockRejectedValue(new Error('conflict'))
    mocks.read.mockResolvedValueOnce([{ values: rows }]).mockResolvedValueOnce([{ values: [...rows, ['신규', '활동']] }])
    expect((await call({ name: '신규' })).status).toBe(409)
    expect(mocks.write).toHaveBeenCalledOnce()
    expect(mocks.purge).toHaveBeenCalledOnce()
  })
  it('returns actionable save failure and does not retry', async () => {
    mocks.write.mockRejectedValue(new Error('offline'))
    expect((await call({ name: '신규' })).status).toBe(502)
    expect(mocks.write).toHaveBeenCalledOnce()
  })
  it('refuses malformed roster headers', async () => {
    mocks.read.mockResolvedValue([{ values: [['기존', '활동']] }])
    expect((await call({ name: '신규' })).status).toBe(502)
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
