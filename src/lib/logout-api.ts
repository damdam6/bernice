// POST /api/logout 호출을 감싼다. 서버 쪽이 인증 여부와 무관하게 항상 200을 반환하는 멱등
// 동작이라(functions/api/logout.ts) 응답 바디를 해석할 필요가 없다 — 네트워크 자체 실패만
// 호출부가 판단할 수 있게 그대로 던진다(login-api.ts와 동일 관용구).
export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' })
}
