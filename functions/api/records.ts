// GET /api/records — #21 계약(RecordsResponse)대로 시트 데이터를 조립해 반환한다.
// 인증은 _middleware.ts(#42)가 /api/* 전체에서 담당한다 — 여기 도달한 요청은 이미 세션 검증
// 통과. 무효화는 P2의 /api/refresh가 records-cache.ts의 같은 키로 cache.delete를 호출해
// 담당한다(이 이슈 범위 밖).

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
  if (cached) return withNoStore(cached)

  try {
    const bundle = await fetchSheetBundle(context.env, context.env.SHEET_ID)
    const body = buildRecordsResponse(bundle, new Date().toISOString())
    // max-age는 엣지 저장 사본의 TTL 전용이다 — Cache API가 이 헤더로 수명을 정하므로 저장할
    // 사본에는 반드시 남아야 한다(no-store 사본은 저장 자체가 거부된다). clone()을 먼저 떠서
    // put에 넘기고, 클라이언트로 나가는 쪽만 no-store로 바꾼다 — 순서가 뒤집히면 엣지 캐시가
    // 무력화된다.
    const response = Response.json(body, {
      headers: { 'Cache-Control': `public, max-age=${RECORDS_CACHE_TTL_SECONDS}` },
    })

    context.waitUntil(cache.put(cacheKey, response.clone()))
    return withNoStore(response)
  } catch (err) {
    return errorResponse(err)
  }
}

// 클라이언트가 받는 응답은 미스·히트 모두 no-store — 브라우저가 /api/records를 자체 캐시하면
// 관리자 저장 직후의 invalidate refetch가 네트워크에 닿지 못해 옛 데이터를 다시 본다(#162).
// cache.match가 돌려준 응답은 헤더가 immutable이라 headers.set이 던지므로, status·헤더를 그대로
// 물려받는 new Response(body, init)로 복제한 뒤 Cache-Control만 교체한다.
function withNoStore(response: Response): Response {
  const copy = new Response(response.body, response)
  copy.headers.set('Cache-Control', 'no-store')
  return copy
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
