// 테스트 전용 — KVNamespace 중 rate limiting이 쓰는 get/put/delete만 흉내 낸 in-memory 모의.
// KV의 expirationTtl은 흉내 내지 않는다: 논리 만료는 resetAt으로 판정되므로
// 만료 시나리오는 now 주입으로 검증한다. (*.test.ts가 아니라 vitest 수집 대상은 아님)
import type { RateLimitKV } from './login-rate-limit'

export function makeMockKV(): RateLimitKV & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(key) {
      return store.get(key) ?? null
    },
    async put(key, value) {
      store.set(key, value)
    },
    async delete(key) {
      store.delete(key)
    },
  }
}
