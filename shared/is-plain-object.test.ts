import { describe, expect, it } from 'vitest'
import { isPlainObject } from './is-plain-object'

describe('isPlainObject', () => {
  it('일반 객체는 통과한다', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
  })

  it('null·배열은 typeof가 object여도 제외한다', () => {
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject([{ a: 1 }])).toBe(false)
  })

  it('원시값은 제외한다', () => {
    expect(isPlainObject(undefined)).toBe(false)
    expect(isPlainObject('{}')).toBe(false)
    expect(isPlainObject(0)).toBe(false)
    expect(isPlainObject(true)).toBe(false)
  })
})
