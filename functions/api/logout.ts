// POST /api/logout (#67) — 세션 쿠키를 즉시 만료시킨다.
// team/admin 구분 없이, 세션이 있든 없든 항상 200 — 로그아웃은 실패할 이유가 없는 멱등 동작이다.
// buildSessionSetCookie(_, {maxAgeSeconds:0})가 session-cookie.ts에 이미 이 용도로 준비돼 있다 —
// 토큰 값 자체는 브라우저가 Max-Age=0을 받는 즉시 버리므로 의미가 없어 빈 문자열을 넘긴다.

import { buildSessionSetCookie } from '../lib/session-cookie'

export const onRequestPost: PagesFunction = async (context) => {
  const { request } = context
  const secure = new URL(request.url).protocol === 'https:'

  return Response.json(
    { ok: true },
    { status: 200, headers: { 'Set-Cookie': buildSessionSetCookie('', { maxAgeSeconds: 0, secure }) } },
  )
}
