// 고정시간(constant-time) 문자열 동등 비교 — 패스코드 검증의 타이밍 사이드채널을 막는다.
// Workers 런타임엔 node:crypto.timingSafeEqual이 없고 crypto.subtle(Web Crypto)만 있어,
// double-HMAC 기법을 쓴다: 요청마다 임의 키로 두 입력의 HMAC-SHA256을 각각 계산하고
// crypto.subtle.verify(타이밍 세이프 비교 내장)로 다이제스트를 비교한다.
// - 항상 32바이트 다이제스트끼리 비교하므로 입력 '내용' 길이가 비교 시간에 새지 않는다.
// - 키가 매 호출 임의라 사전계산·오프라인 다이제스트 비교 공격면이 없다.
// - JS 수동 XOR 루프는 JIT 최적화로 상수시간이 보장되지 않고 길이도 노출돼 이 용도에 부적합하다.

export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  const encoder = new TextEncoder()
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(a))
  return crypto.subtle.verify('HMAC', key, mac, encoder.encode(b))
}
