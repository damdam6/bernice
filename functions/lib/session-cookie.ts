// 인증 세션 토큰(HMAC-SHA256 서명)과 세션 쿠키의 발급·검증·파싱·직렬화 유틸.
// 여기서 "세션"은 로그인 인증 세션이다 — 훈련 회차를 다루는 parse-session.ts와 무관.
// Workers 런타임에는 node:crypto가 없어 crypto.subtle(Web Crypto)만 사용한다.
//
// 토큰 포맷: v1.<base64url(JSON{iat,exp})>.<base64url(HMAC-SHA256("v1."+payload))>
// - iat/exp는 epoch 초. 팀 공용 패스코드 게이트라 사용자 식별 클레임이 없고 exp만 필수.
// - 버전 프리픽스가 서명 입력에 포함되므로, 포맷이 진화해도(v2) v1 서명을 재해석할 수 없다.
// - base64url + '.'만 쓰므로 쿠키 값 인코딩이 따로 필요 없다.
// - 표준 JWT(HS256)를 쓰지 않는 이유: 자체 발급·자체 검증이라 상호운용 요구가 없고,
//   고정 헤더부와 alg 혼동 공격면만 늘어난다.
//
// 소비자: #41 POST /api/login(issueSessionToken + buildSessionSetCookie),
// #42 인증 미들웨어(parseCookies + verifySessionToken). secret은 파라미터로만 받아
// env 접근 없는 순수 유틸로 유지한다 — 두 소비자는 같은 값(SESSION_SECRET)을 넘겨야 한다.

export const SESSION_COOKIE_NAME = 'bernice_session'

// 토큰 exp와 쿠키 Max-Age가 공유하는 수명 — 팀 편의 우선 30일.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

const TOKEN_VERSION = 'v1'

// secret별 import된 HMAC 키 캐시 — 미들웨어(#42)가 요청마다 검증하므로 재사용한다.
const keyCache = new Map<string, Promise<CryptoKey>>()

function getHmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) {
    throw new Error('세션 시크릿이 비어 있습니다 — SESSION_SECRET 설정을 확인하세요.')
  }

  let key = keyCache.get(secret)
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
    keyCache.set(secret, key)
  }
  return key
}

export async function issueSessionToken(secret: string, now = Date.now()): Promise<string> {
  const key = await getHmacKey(secret)
  const iat = Math.floor(now / 1000)
  const payload = base64UrlEncodeBytes(
    new TextEncoder().encode(JSON.stringify({ iat, exp: iat + SESSION_TTL_SECONDS })),
  )
  const signingInput = `${TOKEN_VERSION}.${payload}`
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
}

// 구조 → 서명(crypto.subtle.verify: 타이밍 세이프 비교 내장) → 만료 순으로 검사한다.
// payload 해석은 서명 확인 뒤에만 — 검증 안 된 입력을 신뢰하는 지점을 만들지 않는다.
// 비정상 입력은 전부 throw 없이 false — 미들웨어가 try/catch 없이 쓰는 것이 계약이다.
// 단 빈 secret은 설정 누락이므로 조용한 401 대신 명확한 에러로 던진다.
export async function verifySessionToken(
  token: string | null | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const key = await getHmacKey(secret)
  if (!token) return false

  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false
  const [, payloadB64, signatureB64] = parts

  const signature = base64UrlDecodeBytes(signatureB64)
  if (!signature) return false
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    new TextEncoder().encode(`${TOKEN_VERSION}.${payloadB64}`),
  )
  if (!valid) return false

  const payloadBytes = base64UrlDecodeBytes(payloadB64)
  if (!payloadBytes) return false
  let claims: unknown
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return false
  }
  if (typeof claims !== 'object' || claims === null) return false

  const { exp } = claims as { exp?: unknown }
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false

  return now < exp * 1000
}

// Cookie 요청 헤더를 이름→값 레코드로 파싱한다. 절대 throw하지 않는다.
// - 중복 이름은 첫 값 우선 (RFC 6265 §5.4 — 더 구체적인 쿠키가 앞에 온다)
// - 값의 퍼센트 인코딩은 풀되, 깨진 인코딩은 원문 그대로 둔다
// - 프로토타입 키('toString' 등)와 충돌하지 않도록 null-프로토타입 객체에 담는다
export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = Object.create(null)
  if (!header) return cookies

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const name = pair.slice(0, eq).trim()
    if (!name || name in cookies) continue
    const raw = pair.slice(eq + 1).trim()
    try {
      cookies[name] = decodeURIComponent(raw)
    } catch {
      cookies[name] = raw
    }
  }
  return cookies
}

export interface SessionCookieOptions {
  // 기본 SESSION_TTL_SECONDS. 0이면 즉시 만료 — 세션 삭제(로그아웃)용.
  maxAgeSeconds?: number
  // 기본 true. Secure 쿠키를 저장하지 못하는 로컬 http 브라우저 확인에서만 끈다.
  secure?: boolean
}

// #41 계약(HttpOnly · Secure · SameSite=Lax · Max-Age) 그대로의 Set-Cookie 헤더 값.
// 토큰은 base64url + '.'뿐이라 값 인코딩이 필요 없다.
export function buildSessionSetCookie(token: string, options: SessionCookieOptions = {}): string {
  const { maxAgeSeconds = SESSION_TTL_SECONDS, secure = true } = options
  let cookie = `${SESSION_COOKIE_NAME}=${token}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly`
  if (secure) cookie += '; Secure'
  return `${cookie}; SameSite=Lax`
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 잘못된 base64url이면 null — 검증 흐름이 throw 없이 false로 수렴하도록 한다.
function base64UrlDecodeBytes(input: string): Uint8Array | null {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}
