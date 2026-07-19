// POST /api/refresh — records 캐시(RECORDS_CACHE_KEY)를 수동으로 무효화한다(#43).
// 인증은 _middleware.ts(#42)에 전적으로 위임한다 — /api/admin/*이 아니므로 로그인한 모든 세션
// (team·admin)이 401 게이트만 통과하면 호출할 수 있고, 이 핸들러는 자체 검증을 하지 않는다.

import { RECORDS_CACHE_KEY } from '../lib/records-cache'

export const onRequestPost: PagesFunction = async () => {
  const deleted = await caches.default.delete(RECORDS_CACHE_KEY)
  return Response.json({ deleted })
}
