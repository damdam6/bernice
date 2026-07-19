import { describe, expect, it } from 'vitest'
import {
  MAX_FAILURES,
  WINDOW_SECONDS,
  checkLoginBlock,
  clearLoginFailures,
  recordLoginFailure,
} from './login-rate-limit'
import { makeMockKV } from './mock-kv'

const IP = '203.0.113.7'
const T0 = 1_800_000_000_000 // 고정 기준 시각(epoch ms)

describe('login-rate-limit', () => {
  it('실패가 임계 미만이면 차단하지 않는다', async () => {
    const kv = makeMockKV()
    for (let i = 0; i < MAX_FAILURES - 1; i++) await recordLoginFailure(kv, IP, T0 + i)

    expect(await checkLoginBlock(kv, IP, T0 + MAX_FAILURES)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    })
  })

  it('실패 임계 도달 시 차단하고 Retry-After를 마지막 실패 기준으로 계산한다', async () => {
    const kv = makeMockKV()
    for (let i = 0; i < MAX_FAILURES; i++) await recordLoginFailure(kv, IP, T0)

    const halfWindowMs = (WINDOW_SECONDS / 2) * 1000
    const status = await checkLoginBlock(kv, IP, T0 + halfWindowMs)
    expect(status.blocked).toBe(true)
    expect(status.retryAfterSeconds).toBe(WINDOW_SECONDS / 2)
  })

  it('연속 실패는 창을 다시 민다(슬라이딩) — 마지막 실패로부터 WINDOW가 기준', async () => {
    const kv = makeMockKV()
    const stepMs = 60 * 1000
    for (let i = 0; i < MAX_FAILURES; i++) await recordLoginFailure(kv, IP, T0 + i * stepMs)

    const lastFailure = T0 + (MAX_FAILURES - 1) * stepMs
    const status = await checkLoginBlock(kv, IP, lastFailure)
    expect(status.blocked).toBe(true)
    expect(status.retryAfterSeconds).toBe(WINDOW_SECONDS)
  })

  it('창이 지나면 차단이 풀리고 카운트도 0부터 다시 센다', async () => {
    const kv = makeMockKV()
    for (let i = 0; i < MAX_FAILURES; i++) await recordLoginFailure(kv, IP, T0)

    const afterWindow = T0 + WINDOW_SECONDS * 1000
    expect((await checkLoginBlock(kv, IP, afterWindow)).blocked).toBe(false)

    // 만료 후 첫 실패는 1회째 — 임계까지 다시 MAX_FAILURES번 필요하다.
    await recordLoginFailure(kv, IP, afterWindow)
    expect((await checkLoginBlock(kv, IP, afterWindow + 1)).blocked).toBe(false)
  })

  it('clearLoginFailures는 카운터를 지워 다음 실패가 1회부터 시작된다', async () => {
    const kv = makeMockKV()
    for (let i = 0; i < MAX_FAILURES; i++) await recordLoginFailure(kv, IP, T0)
    await clearLoginFailures(kv, IP)

    expect((await checkLoginBlock(kv, IP, T0 + 1)).blocked).toBe(false)
    expect(kv.store.size).toBe(0)
  })

  it('IP가 다르면 카운터가 독립이다', async () => {
    const kv = makeMockKV()
    for (let i = 0; i < MAX_FAILURES; i++) await recordLoginFailure(kv, IP, T0)

    expect((await checkLoginBlock(kv, IP, T0 + 1)).blocked).toBe(true)
    expect((await checkLoginBlock(kv, '198.51.100.9', T0 + 1)).blocked).toBe(false)
  })

  it('손상된 KV 값은 없는 것으로 취급한다', async () => {
    const kv = makeMockKV()
    kv.store.set(`login-fail:${IP}`, 'not-json{')

    expect((await checkLoginBlock(kv, IP, T0)).blocked).toBe(false)
    await recordLoginFailure(kv, IP, T0)
    expect(JSON.parse(kv.store.get(`login-fail:${IP}`)!)).toMatchObject({ count: 1 })
  })
})
