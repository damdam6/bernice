// POST /api/login — 팀/관리자 패스코드를 검증해 role 세션 쿠키를 발급한다(#41).
// 입력 코드를 ADMIN_CODE·TEAM_PASSCODE와 고정시간 비교(constant-time-equal)해 일치한 쪽으로
// role을 정하고, 세션 토큰을 발급해 Set-Cookie(HttpOnly·Secure·SameSite=Lax·Max-Age)로 내려준다.
// 실패는 단일 401 메시지로 통일해 team/admin 열거 오라클을 막고, 비-JSON 바디는 400.
// 무차별 대입 방어(#80): IP당 실패가 임계를 넘으면 로그인 시도 자체를 429로 차단한다 —
// LOGIN_RATE_LIMIT(KV) 미바인딩이면 fail-open으로 건너뛰어 바인딩 생성 전 배포도 안전하다.
// role 검사(읽기=세션, /api/admin/*=admin)는 후속 #42 미들웨어 몫 — 여기선 발급만 한다.

import { constantTimeEqual } from '../lib/constant-time-equal'
import { checkLoginBlock, clearLoginFailures, recordLoginFailure } from '../lib/login-rate-limit'
import { buildSessionSetCookie, issueSessionToken, type SessionRole } from '../lib/session-cookie'

interface Env {
  TEAM_PASSCODE: string
  ADMIN_CODE: string
  SESSION_SECRET: string
  LOGIN_RATE_LIMIT?: KVNamespace
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // 차단 검사는 바디 파싱보다 먼저 — 차단 중에는 패스코드 검증 경로가 아예 돌지 않는다.
  const kv = env.LOGIN_RATE_LIMIT
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  let hasFailures = false
  if (kv) {
    const status = await checkLoginBlock(kv, ip)
    if (status.blocked) return tooManyAttempts(status.retryAfterSeconds)
    hasFailures = status.hasFailures
  }

  let code: unknown
  try {
    const body = (await request.json()) as { code?: unknown } | null
    code = body?.code
  } catch {
    return Response.json({ error: 'bad_request', message: 'JSON 바디가 필요합니다.' }, { status: 400 })
  }

  // 빈 code는 빈 설정값과의 우연한 매치를 피하려 검증 전에 거른다(아래 resolveRole도 이중 방어).
  if (typeof code !== 'string' || code === '') return failed(kv, ip)

  const role = await resolveRole(code, env)
  if (!role) return failed(kv, ip)

  // 성공은 실패 흔적을 지운다 — 공유 IP에서 정상 이용자의 오입력이 누적돼 남지 않도록.
  // 기록이 있을 때만 delete: 실패 이력 없는 로그인에서 불필요한 KV 쓰기를 아낀다.
  if (kv && hasFailures) await clearLoginFailures(kv, ip)

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

// 401 실패를 카운트에 반영한 뒤 응답한다. 400(비-JSON)은 패스코드 추측이 아니라 미집계.
async function failed(kv: KVNamespace | undefined, ip: string): Promise<Response> {
  if (kv) await recordLoginFailure(kv, ip)
  return unauthorized()
}

function unauthorized(): Response {
  return Response.json(
    { error: 'invalid_passcode', message: '패스코드가 올바르지 않습니다.' },
    { status: 401 },
  )
}

function tooManyAttempts(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'too_many_attempts', message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
