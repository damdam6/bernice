// GET /api/records — #21 계약(RecordsResponse)대로 시트 데이터를 조립해 반환한다.
// 인증 게이트는 P2 범위 — 여기서는 적용하지 않는다. 무효화는 P2의 /api/refresh가
// records-cache.ts의 같은 키로 cache.delete를 호출해 담당한다(이 이슈 범위 밖).

import type { Env as SheetsEnv } from '../lib/sheetsApi'
import { SheetsApiError, fetchSheetBundle } from '../lib/sheetsApi'
import { RecordsAssemblyError, buildRecordsResponse } from '../lib/build-records-response'
import { RECORDS_CACHE_KEY, RECORDS_CACHE_TTL_SECONDS } from '../lib/records-cache'

interface Env extends SheetsEnv {
  SHEET_ID: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const cache = caches.default
  const cacheKey = new Request(RECORDS_CACHE_KEY)

  const cached = await cache.match(cacheKey)
  if (cached) return cached

  try {
    const bundle = await fetchSheetBundle(context.env, context.env.SHEET_ID)
    const body = buildRecordsResponse(bundle, new Date().toISOString())
    const response = Response.json(body, {
      headers: { 'Cache-Control': `public, max-age=${RECORDS_CACHE_TTL_SECONDS}` },
    })

    context.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  } catch (err) {
    return errorResponse(err)
  }
}

function errorResponse(err: unknown): Response {
  if (err instanceof SheetsApiError) {
    return Response.json(
      { error: 'sheets_api_error', message: err.message, upstreamStatus: err.status },
      { status: 502 },
    )
  }
  if (err instanceof RecordsAssemblyError) {
    return Response.json({ error: err.code, message: err.message }, { status: 500 })
  }
  if (err instanceof Error) {
    return Response.json({ error: 'sheet_data_invalid', message: err.message }, { status: 500 })
  }
  return Response.json({ error: 'internal_error', message: '알 수 없는 오류' }, { status: 500 })
}
