// /api/records 캐시 키·TTL·무효화 헬퍼 — Cache API(caches.default) 접근을 여기 한 곳으로 모은다.
// 실제 요청(context.request)이 아니라 고정된 합성 URL을 키로 써서, 쿼리스트링·헤더
// 차이로 캐시가 쪼개지지 않고 팀 전체가 같은 응답 하나를 공유하게 한다.
// 버전 접미사는 RecordsResponse 모양이 바뀌면 하나 올려 구버전 캐시를 자연스럽게
// 무효화하기 위한 것(v2: EventDefinition.exemptable 추가 #159 — 구캐시 응답엔 이 필드가
// 없어 프론트 런타임 검증이 거부하므로 반드시 동행 범프). 무효화 호출부(admin/records.ts·
// add-players.ts·create-sheet.ts·refresh.ts)는 모두 아래 purgeRecordsCache()를 거치므로,
// 이 값을 바꿔도 갱신할 곳은 여기 하나뿐이다.
export const RECORDS_CACHE_KEY = 'https://bernice-cache.internal/records/v2'

// 콜로 로컬 한계의 안전망 TTL — cache.delete는 요청이 닿은 콜로에서만 지워지므로,
// 무효화가 닿지 않은 콜로는 이 값까지 스테일을 서빙할 수 있다(#164). 짧게 잡아 그
// 최악 상한을 줄인다; 무효화 자체는 여전히 쓰기 경로(purgeRecordsCache)와 P2
// /api/refresh(로그인 필요)가 담당한다.
export const RECORDS_CACHE_TTL_SECONDS = 60 * 15 // 15분

// records 엣지 캐시 삭제 단일 창구. 항상 응답을 돌려주기 전에 await해야 한다(PRD §09) —
// waitUntil로 미루면 삭제가 끝나기 전에 다음 GET refetch가 옛 캐시를 받을 수 있다.
export async function purgeRecordsCache(): Promise<boolean> {
  return caches.default.delete(new Request(RECORDS_CACHE_KEY))
}
