// /api/* 인증 게이트(#42) — 세션 쿠키를 검증해 실패면 401 {"error":"unauthorized"},
// /api/admin/* 에 team 세션이면 403 {"error":"forbidden"}. 이 두 응답이 확정 계약이며
// 프론트 P3-3(useRecords)·관리자 UI가 이 error 코드로 분기한다(docs/prd-record-input.html §06).
// 예외 경로는 /api/login·/api/health 정확 일치뿐 — prefix 매칭은 의도치 않은 통과를
// 만들 수 있어 쓰지 않는다(fail-closed).
//
// 파일 위치가 functions/_middleware.ts(루트)가 아닌 이유: 루트 미들웨어는 Pages 라우팅에
// /* 를 추가해 정적 자산 요청까지 전부 Function 호출로 끌어들인다. 여기(functions/api/)면
// 라우트가 정확히 /api/* 로 잡혀 보호 대상과 실행 범위가 일치한다 — 아직 함수 파일이 없는
// /api/admin/* 요청도 이 미들웨어에는 걸리므로 403 계약이 admin 라우트 신설 전부터 유효하다.
//
// 검증 로직은 전부 session-cookie.ts 소비: verifySessionToken은 비정상 입력에 throw 없이
// null을 돌려주는 것이 계약이라 try/catch가 필요 없다. 단 SESSION_SECRET 미설정이면 명시적
// throw → 500 — 설정 누락을 조용한 401로 위장하지 않는 fail-loud(유틸의 설계 의도).

import { SESSION_COOKIE_NAME, parseCookies, verifySessionToken } from '../lib/session-cookie'

interface Env {
  SESSION_SECRET: string
}

// 인증 없이 접근 가능한 경로 — 로그인 진입점과 헬스체크.
const PUBLIC_PATHS = new Set(['/api/login', '/api/health'])

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context
  const pathname = normalizePathname(new URL(request.url).pathname)

  if (PUBLIC_PATHS.has(pathname)) return next()

  const cookies = parseCookies(request.headers.get('Cookie'))
  const claims = await verifySessionToken(cookies[SESSION_COOKIE_NAME], env.SESSION_SECRET)
  if (!claims) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요합니다.' }, { status: 401 })
  }

  if (isAdminPath(pathname) && claims.role !== 'admin') {
    return Response.json(
      { error: 'forbidden', message: '관리자 권한이 필요합니다.' },
      { status: 403 },
    )
  }

  return next()
}

// /api/adminx 같은 접두 오탐을 막으려 맨몸 경로와 하위 경로를 나눠 본다.
function isAdminPath(pathname: string): boolean {
  return pathname === '/api/admin' || pathname.startsWith('/api/admin/')
}

// 판정 전에 퍼센트 인코딩을 푼다 — 라우터가 %2F를 디코드해 admin 함수에 매칭하는 경우에도
// 미들웨어 판정이 더 좁아지는(=제한을 우회당하는) 일이 없게, 판정을 라우터보다 넓게 유지한다.
// 깨진 인코딩은 원문 그대로 판정 — 공개 경로와도 admin과도 매칭되지 않아 fail-closed다.
function normalizePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}
