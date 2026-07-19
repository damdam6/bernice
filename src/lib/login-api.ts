// POST /api/login 호출을 감싼다 — fetchRecords(../hooks/useRecords.ts)와 같은 관용구로,
// 호출부(LoginGate)가 fetch·헤더·바디 직렬화·에러 바디 파싱을 직접 다루지 않고 결과 타입
// 하나만 보고 분기하게 한다. 네트워크 자체 실패(fetch가 throw)는 감싸지 않고 그대로
// 전파한다 — 호출부가 이미 그 경우를 자체 catch로 처리하고 있기 때문이다.
export interface LoginResult {
  ok: boolean
  message?: string
}

export async function loginWithPasscode(code: string): Promise<LoginResult> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (res.ok) return { ok: true }

  const body = (await res.json().catch(() => null)) as { message?: string } | null
  return { ok: false, message: body?.message }
}
