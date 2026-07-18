// 로그인 실패 카운터 기반 rate limiting — /api/login 무차별 대입(brute-force)을 막는다(#80).
// IP당 실패 횟수를 KV(`login-fail:{ip}`)에 { count, resetAt } JSON으로 누적하고,
// 실패가 MAX_FAILURES에 닿으면 마지막 실패로부터 WINDOW_SECONDS 동안 차단(429 대상)한다.
// 슬라이딩 윈도우: 실패할 때마다 resetAt과 KV TTL을 창 길이만큼 다시 민다. 차단 중에는
// 기록하지 않으므로 차단이 연장되지 않고, 창이 지나면 KV TTL로 키가 스스로 사라진다.
// KV eventual consistency상 여러 PoP 동시 시도가 임계를 몇 회 넘길 수 있으나(이슈 #80에
// 기록된 알려진 한계), 무차별 대입을 무력화하는 목적에는 충분하다.

export const MAX_FAILURES = 5
export const WINDOW_SECONDS = 600 // 10분 — KV 최소 TTL(60초)보다 항상 크다.

// KVNamespace 중 이 모듈이 쓰는 최소 표면 — 테스트에서 in-memory 모의로 대체한다.
export interface RateLimitKV {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

interface FailureRecord {
  count: number
  resetAt: number // epoch ms — 이 시각까지 차단 판정에 유효
}

export interface BlockStatus {
  blocked: boolean
  retryAfterSeconds: number // blocked=false면 0
}

function keyFor(ip: string): string {
  return `login-fail:${ip}`
}

// KV 값이 없거나 손상됐거나 논리적으로 만료(now >= resetAt)면 null — 새로 센다.
async function readRecord(kv: RateLimitKV, ip: string, now: number): Promise<FailureRecord | null> {
  const raw = await kv.get(keyFor(ip))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as FailureRecord
    if (typeof parsed.count !== 'number' || typeof parsed.resetAt !== 'number') return null
    if (now >= parsed.resetAt) return null
    return parsed
  } catch {
    return null
  }
}

export async function checkLoginBlock(kv: RateLimitKV, ip: string, now = Date.now()): Promise<BlockStatus> {
  const record = await readRecord(kv, ip, now)
  if (!record || record.count < MAX_FAILURES) return { blocked: false, retryAfterSeconds: 0 }
  return { blocked: true, retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000) }
}

export async function recordLoginFailure(kv: RateLimitKV, ip: string, now = Date.now()): Promise<void> {
  const record = await readRecord(kv, ip, now)
  const next: FailureRecord = { count: (record?.count ?? 0) + 1, resetAt: now + WINDOW_SECONDS * 1000 }
  await kv.put(keyFor(ip), JSON.stringify(next), { expirationTtl: WINDOW_SECONDS })
}

export async function clearLoginFailures(kv: RateLimitKV, ip: string): Promise<void> {
  await kv.delete(keyFor(ip))
}
