// Admin authentication is enforced by /api/_middleware.ts.
import { isPlainObject } from '../../../shared/is-plain-object'
import { batchGetValues, getSpreadsheetSheets, quoteSheetName, type Env as SheetsEnv } from '../../lib/sheetsApi'
import { classifySheetTabs } from '../../lib/sheetTabs'
import { parseRoster } from '../../lib/roster'
import { batchUpdate } from '../../lib/sheetsWriteApi'
import { purgeRecordsCache } from '../../lib/records-cache'

interface Env extends SheetsEnv { SHEET_ID: string }
const duplicate = () => Response.json({ message: '이미 등록된 이름입니다. 동명이인은 구분할 수 있는 이름으로 입력해주세요.' }, { status: 409 })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let raw: unknown
  try { raw = await request.json() }
  catch { return Response.json({ message: '올바른 JSON 입력이 필요합니다.' }, { status: 400 }) }
  if (!isPlainObject(raw) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(raw.name)) {
    return Response.json({ message: '이름은 1~100자의 한 줄로 입력해주세요.' }, { status: 400 })
  }
  const name = raw.name.trim().normalize('NFC')
  try {
    const sheets = await getSpreadsheetSheets(env, env.SHEET_ID)
    const rosterName = classifySheetTabs(sheets.map((sheet) => sheet.title)).roster
    const sheet = sheets.find((sheet) => sheet.title === rosterName)
    if (!sheet) throw new Error('명단 탭 없음')
    const range = quoteSheetName(sheet.title)
    const [roster] = await batchGetValues(env, env.SHEET_ID, [range])
    parseRoster(roster.values) // Fail closed on malformed headers; never shift existing row-based IDs.
    const hasName = (rows: string[][]) => rows.slice(1).some((row) => (row[0] ?? '').trim().normalize('NFC') === name)
    // Include retired players and malformed rows: those names can still occur in historical sessions.
    if (hasName(roster.values)) return duplicate()

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name))
    const reservation = 'bernice_member_' + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    try {
      // Named range IDs are unique. Reserve the normalized name and append atomically so
      // simultaneous same-name requests cannot both commit. The range covers the roster;
      // it is not a player ID. appendCells never fills holes or shifts existing rows.
      await batchUpdate(env, env.SHEET_ID, [
        { addNamedRange: { namedRange: { namedRangeId: reservation, name: reservation, range: { sheetId: sheet.sheetId } } } },
        { appendCells: { sheetId: sheet.sheetId, rows: [{ values: [name, '활동'].map((stringValue) => ({ userEnteredValue: { stringValue } })) }], fields: 'userEnteredValue' } },
      ], false) // An append must not be automatically retried after an ambiguous response.
    } catch (error) {
      await purgeRecordsCache()
      const [latest] = await batchGetValues(env, env.SHEET_ID, [range])
      if (hasName(latest.values)) return duplicate()
      throw error
    }
    await purgeRecordsCache()
    return Response.json({ name }, { status: 201 })
  } catch {
    return Response.json({ message: '저장 결과를 확인할 수 없습니다. 명단을 새로 고침해 반영 여부를 확인한 뒤 다시 시도해주세요.' }, { status: 502 })
  }
}
