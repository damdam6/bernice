// POST /api/login — 팀/관리자 패스코드를 검증해 role 세션 쿠키를 발급한다(#41).
// 입력 코드를 ADMIN_CODE·TEAM_PASSCODE와 고정시간 비교(constant-time-equal)해 일치한 쪽으로
// role을 정하고, 세션 토큰을 발급해 Set-Cookie(HttpOnly·Secure·SameSite=Lax·Max-Age)로 내려준다.
// 실패는 단일 401 메시지로 통일해 team/admin 열거 오라클을 막고, 비-JSON 바디는 400.
// role 검사(읽기=세션, /api/admin/*=admin)는 후속 #42 미들웨어 몫 — 여기선 발급만 한다.

import { constantTimeEqual } from '../lib/constant-time-equal'
import { buildSessionSetCookie, issueSessionToken, type SessionRole } from '../lib/session-cookie'

interface Env {
  TEAM_PASSCODE: string
  ADMIN_CODE: string
  SESSION_SECRET: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  let code: unknown
  try {
    const body = (await request.json()) as { code?: unknown } | null
    code = body?.code
  } catch {
    return Response.json({ error: 'bad_request', message: 'JSON 바디가 필요합니다.' }, { status: 400 })
  }

  // 빈 code는 빈 설정값과의 우연한 매치를 피하려 검증 전에 거른다(아래 resolveRole도 이중 방어).
  if (typeof code !== 'string' || code === '') return unauthorized()

  const role = await resolveRole(code, env)
  if (!role) return unauthorized()

  const token = await issueSessionToken(env.SESSION_SECRET, role)
  // 프로덕션(https)에서만 Secure — wrangler pages dev의 http://localhost에선 브라우저가 저장 못 함.
  const secure = new URL(request.url).protocol === 'https:'
  return Response.json(
    { ok: true, role },
    { status: 200, headers: { 'Set-Cookie': buildSessionSetCookie(token, { secure }) } },
  )
}

// ADMIN_CODE·TEAM_PASSCODE 양쪽을 (단락 없이) 비교한 뒤 role을 정한다 — 관리자 우선.
// 설정값이 빈/미설정이면 그 경로는 매치 불가(matches가 false) — change-me 방치 상태에서
// 임의 입력이 통과하는 우회를 원천 차단한다.
async function resolveRole(code: string, env: Env): Promise<SessionRole | null> {
  const adminMatch = await matches(code, env.ADMIN_CODE)
  const teamMatch = await matches(code, env.TEAM_PASSCODE)
  if (adminMatch) return 'admin'
  if (teamMatch) return 'team'
  return null
}

async function matches(code: string, configured: string | undefined): Promise<boolean> {
  if (!configured) return false
  return constantTimeEqual(code, configured)
}

function unauthorized(): Response {
  return Response.json(
    { error: 'invalid_passcode', message: '패스코드가 올바르지 않습니다.' },
    { status: 401 },
  )
}
