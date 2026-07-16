// /api/records 캐시 키·TTL — Cache API(caches.default)용 상수만 소유한다.
// 실제 요청(context.request)이 아니라 고정된 합성 URL을 키로 써서, 쿼리스트링·헤더
// 차이로 캐시가 쪼개지지 않고 팀 전체가 같은 응답 하나를 공유하게 한다.
// 버전 접미사(v1)는 RecordsResponse 모양이 바뀌면 v2로 올려 구버전 캐시를 자연스럽게
// 무효화하기 위한 것. P2의 /api/refresh는 이 키를 그대로 import해 cache.delete로
// 무효화해야 하므로, 이 값을 바꾸면 그쪽도 함께 갱신해야 한다.
export const RECORDS_CACHE_KEY = 'https://bernice-cache.internal/records/v1'

// "긴 캐시" 기본값 — 무효화는 P2 /api/refresh(로그인 필요)가 담당하므로 길게 잡는다.
// 필요하면 이 상수만 조정하면 된다.
export const RECORDS_CACHE_TTL_SECONDS = 60 * 60 * 6 // 6시간
