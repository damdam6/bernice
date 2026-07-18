import { describe, expect, it } from 'vitest'
import { constantTimeEqual } from './constant-time-equal'

describe('constantTimeEqual', () => {
  it('같은 문자열은 true', async () => {
    expect(await constantTimeEqual('team-passcode', 'team-passcode')).toBe(true)
    expect(await constantTimeEqual('한글-코드-1234', '한글-코드-1234')).toBe(true)
  })

  it('다른 문자열은 false', async () => {
    expect(await constantTimeEqual('team-passcode', 'team-passcodE')).toBe(false)
    expect(await constantTimeEqual('admin', 'team')).toBe(false)
  })

  it('길이가 다른 문자열은 false', async () => {
    expect(await constantTimeEqual('abc', 'abcd')).toBe(false)
    expect(await constantTimeEqual('abcd', 'abc')).toBe(false)
  })

  it('빈 문자열 경계: 빈 값끼리는 true, 빈 값과 비빈 값은 false', async () => {
    expect(await constantTimeEqual('', '')).toBe(true)
    expect(await constantTimeEqual('', 'x')).toBe(false)
    expect(await constantTimeEqual('x', '')).toBe(false)
  })
})
