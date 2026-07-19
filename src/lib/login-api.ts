// POST /api/login 호출을 감싼다 — fetchRecords(../hooks/useRecords.ts)와 같은 관용구로,
// 호출부(LoginGate·AdminLogin)가 fetch·헤더·바디 직렬화·에러 바디 파싱을 직접 다루지 않고 결과 타입
// 하나만 보고 분기하게 한다. 네트워크 자체 실패(fetch가 throw)는 감싸지 않고 그대로
// 전파한다 — 호출부가 이미 그 경우를 자체 catch로 처리하고 있기 때문이다.
//
// role은 서버가 항상 성공 응답에 실어 보내지만(functions/api/login.ts) 팀 게이트(LoginGate)는
// 쓰지 않는다 — 관리자 로그인(#67, AdminLogin)만 team/admin 코드 오분기 방지에 role로 분기한다.
import { isPlainObject } from '../../shared/is-plain-object'

export type LoginRole = 'team' | 'admin'

export interface LoginResult {
  ok: boolean
  role?: LoginRole
  message?: string
}

export async function loginWithPasscode(code: string): Promise<LoginResult> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  // 필드 단위 검증 추출(#93) — role은 AdminLogin의 admin 분기에 쓰이는 값이라 화이트리스트로
  // 좁히고, 그 외 값은 없는 것으로 친다(role 없는 ok:true는 AdminLogin이 실패로 처리).
  const body: unknown = await res.json().catch(() => null)
  const fields: Record<string, unknown> = isPlainObject(body) ? body : {}
  const role = fields.role === 'team' || fields.role === 'admin' ? fields.role : undefined
  const message = typeof fields.message === 'string' ? fields.message : undefined

  if (res.ok) return { ok: true, role }

  return { ok: false, message }
}
