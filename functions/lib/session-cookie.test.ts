import { describe, expect, it } from 'vitest'
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  buildSessionSetCookie,
  issueSessionToken,
  parseCookies,
  verifySessionToken,
} from './session-cookie'

const SECRET = 'test-session-secret'
// 1초 경계 계산이 깔끔하도록 1000ms 배수로 고정한 기준 시각 (2026-07-17T00:00:00Z).
const NOW = 1_784_246_400_000

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text))
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  return atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
}

// 구현과 독립적으로 같은 알고리즘(HMAC-SHA256, "v1."+payload 서명 입력)으로 토큰을 조립한다.
// 서명은 유효하되 payload가 비정상인 경로(서명 통과 이후의 거부 분기)를 테스트하기 위함.
async function signPayload(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v1.${payloadB64}`),
  )
  return `v1.${payloadB64}.${bytesToBase64Url(new Uint8Array(signature))}`
}

describe('issueSessionToken → verifySessionToken 왕복', () => {
  it('발급한 토큰은 검증을 통과한다', async () => {
    const token = await issueSessionToken(SECRET)
    expect(await verifySessionToken(token, SECRET)).toBe(true)
  })

  it('토큰은 v1 3파트 구조이고 payload의 exp - iat이 TTL이다', async () => {
    const token = await issueSessionToken(SECRET, NOW)
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('v1')

    const payload = JSON.parse(decodeBase64Url(parts[1]))
    expect(payload.iat).toBe(NOW / 1000)
    expect(payload.exp - payload.iat).toBe(SESSION_TTL_SECONDS)
  })
})

describe('위조 토큰 거부', () => {
  it('payload를 변조하면(만료 연장 시도) 거부한다', async () => {
    const token = await issueSessionToken(SECRET, NOW)
    const [, payloadB64, signatureB64] = token.split('.')
    const claims = JSON.parse(decodeBase64Url(payloadB64))
    const forgedPayload = encodeBase64Url(JSON.stringify({ ...claims, exp: claims.exp + 3600 }))

    expect(await verifySessionToken(`v1.${forgedPayload}.${signatureB64}`, SECRET, NOW)).toBe(false)
  })

  it('서명을 변조하면 거부한다', async () => {
    const token = await issueSessionToken(SECRET, NOW)
    const [version, payloadB64, signatureB64] = token.split('.')
    // 첫 글자를 바꾼다 — base64url 마지막 글자는 버려지는 비트가 있어 뒤집어도 같은
    // 바이트로 디코드될 수 있지만, 첫 글자는 항상 서명 첫 바이트를 바꾼다.
    const tampered = (signatureB64[0] === 'A' ? 'B' : 'A') + signatureB64.slice(1)

    expect(await verifySessionToken(`${version}.${payloadB64}.${tampered}`, SECRET, NOW)).toBe(false)
  })

  it('다른 secret으로 서명한 토큰을 거부한다', async () => {
    const token = await issueSessionToken('other-secret', NOW)
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false)
  })
})

describe('만료 토큰 거부', () => {
  it('TTL이 지난 토큰을 거부한다', async () => {
    const issuedAt = NOW - (SESSION_TTL_SECONDS + 1) * 1000
    const token = await issueSessionToken(SECRET, issuedAt)
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false)
  })

  it('경계: 만료 1ms 전은 통과, 만료 시각 정각부터 거부한다', async () => {
    const token = await issueSessionToken(SECRET, NOW)
    const expiresAtMs = NOW + SESSION_TTL_SECONDS * 1000

    expect(await verifySessionToken(token, SECRET, expiresAtMs - 1)).toBe(true)
    expect(await verifySessionToken(token, SECRET, expiresAtMs)).toBe(false)
  })
})

describe('비정상 입력은 예외 없이 false', () => {
  it('토큰이 없거나 구조가 다르면 거부한다', async () => {
    expect(await verifySessionToken(null, SECRET)).toBe(false)
    expect(await verifySessionToken(undefined, SECRET)).toBe(false)

    const malformed = ['', 'abc', 'v1.two-parts', 'a.b.c.d', `v2.${encodeBase64Url('{}')}.sig`]
    for (const bad of malformed) {
      expect(await verifySessionToken(bad, SECRET), `입력: ${JSON.stringify(bad)}`).toBe(false)
    }
  })

  it('base64url이 아닌 서명 파트는 거부한다', async () => {
    expect(await verifySessionToken('v1.AAAA.@@@', SECRET)).toBe(false)
  })

  it('서명은 유효하지만 payload가 base64url/JSON이 아니면 거부한다', async () => {
    expect(await verifySessionToken(await signPayload('@@@', SECRET), SECRET)).toBe(false)
    expect(
      await verifySessionToken(await signPayload(encodeBase64Url('not-json'), SECRET), SECRET),
    ).toBe(false)
  })

  it('서명은 유효하지만 exp가 없거나 숫자가 아니면 거부한다', async () => {
    const payloads = ['{"iat":1}', '{"exp":"9999999999"}', '123', 'null']
    for (const json of payloads) {
      const token = await signPayload(encodeBase64Url(json), SECRET)
      expect(await verifySessionToken(token, SECRET), `payload: ${json}`).toBe(false)
    }
  })
})

describe('설정 오류', () => {
  it('빈 secret은 발급·검증 모두 명확한 에러를 던진다', async () => {
    await expect(issueSessionToken('')).rejects.toThrow('세션 시크릿이 비어 있습니다')
    await expect(verifySessionToken('v1.a.b', '')).rejects.toThrow('세션 시크릿이 비어 있습니다')
  })
})

describe('parseCookies', () => {
  it('null/빈 문자열은 빈 레코드를 돌려준다', () => {
    expect(parseCookies(null)).toEqual({})
    expect(parseCookies('')).toEqual({})
  })

  it('여러 쌍과 이름·값 주변 공백을 처리한다', () => {
    expect(parseCookies('a=1; b=2;  c = 3 ')).toEqual({ a: '1', b: '2', c: '3' })
  })

  it('값 안의 =를 보존한다', () => {
    expect(parseCookies('token=abc=def')).toEqual({ token: 'abc=def' })
  })

  it('퍼센트 인코딩을 풀고, 깨진 인코딩은 원문을 유지한다', () => {
    expect(parseCookies('a=%ED%95%9C%EA%B8%80; b=%E0%A4%A')).toEqual({
      a: '한글',
      b: '%E0%A4%A',
    })
  })

  it('중복 이름은 첫 값을 쓴다 (RFC 6265)', () => {
    expect(parseCookies('a=first; a=second')).toEqual({ a: 'first' })
  })

  it('=가 없는 조각과 이름 없는 조각은 건너뛴다', () => {
    expect(parseCookies('garbage; =x; a=1')).toEqual({ a: '1' })
  })

  it("프로토타입 키 이름('toString')도 안전하게 담는다", () => {
    expect(parseCookies('toString=x; a=1')['toString']).toBe('x')
  })
})

describe('buildSessionSetCookie', () => {
  it('#41 계약 속성(HttpOnly·Secure·SameSite=Lax·Max-Age)을 전부 포함한다', async () => {
    const token = await issueSessionToken(SECRET, NOW)
    expect(buildSessionSetCookie(token)).toBe(
      `${SESSION_COOKIE_NAME}=${token}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    )
  })

  it('maxAgeSeconds(삭제용 0)와 secure:false 오버라이드를 반영한다', () => {
    const cookie = buildSessionSetCookie('tok', { maxAgeSeconds: 0, secure: false })
    expect(cookie).toBe(`${SESSION_COOKIE_NAME}=tok; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`)
  })

  it('발급 → Set-Cookie → 파싱 → 검증 왕복이 성립한다', async () => {
    const token = await issueSessionToken(SECRET)
    const cookiePair = buildSessionSetCookie(token).split(';')[0]
    const parsed = parseCookies(`other=1; ${cookiePair}`)

    expect(parsed[SESSION_COOKIE_NAME]).toBe(token)
    expect(await verifySessionToken(parsed[SESSION_COOKIE_NAME], SECRET)).toBe(true)
  })
})
