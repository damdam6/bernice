// Middleware restricts every /api/admin/* endpoint to administrators.
import { fetchSheetBundle, getSpreadsheetSheets, type Env as SheetsEnv, SheetsApiError } from '../../lib/sheetsApi'
import { batchUpdate } from '../../lib/sheetsWriteApi'
import { buildEventPlan, EventInputError, parseEventCommand } from '../../lib/manage-events'
import { purgeRecordsCache } from '../../lib/records-cache'
interface Env extends SheetsEnv { SHEET_ID: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let command
  try { command = parseEventCommand(await request.json()) }
  catch (err) { return Response.json({ message: err instanceof EventInputError ? err.message : '올바른 JSON 입력이 필요합니다.' }, { status: 400 }) }
  try {
    const [bundle, sheets] = await Promise.all([fetchSheetBundle(env, env.SHEET_ID), getSpreadsheetSheets(env, env.SHEET_ID)])
    const sheet = sheets.find((s) => s.title === bundle.goals?.name)
    if (!sheet) throw new Error('목표 탭을 찾을 수 없습니다.')
    const plan = buildEventPlan(bundle, sheet.sheetId, command, crypto.randomUUID())
    // Never retry appendCells: a lost response can mean the append already committed.
    await batchUpdate(env, env.SHEET_ID, plan.requests, false)
    await purgeRecordsCache()
    return Response.json({ id: plan.eventId }, { status: command.action === 'create' ? 201 : 200 })
  } catch (err) {
    if (err instanceof EventInputError) return Response.json({ message: err.message }, { status: 409 })
    if (err instanceof SheetsApiError) return Response.json({ message: '저장 결과를 확인할 수 없습니다. 데이터 새로 고침으로 반영 여부를 확인한 뒤 다시 시도해주세요.' }, { status: 502 })
    return Response.json({ message: '저장 결과를 확인할 수 없습니다. 데이터 새로 고침으로 반영 여부를 확인해주세요.' }, { status: 500 })
  }
}
