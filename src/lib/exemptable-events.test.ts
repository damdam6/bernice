import { describe, expect, it } from 'vitest'
import { isExemptable } from './exemptable-events'

describe('isExemptable', () => {
  it('45도패스캐치는 면제 가능', () => {
    expect(isExemptable('45도패스캐치')).toBe(true)
  })

  it('그 외 종목은 면제 불가', () => {
    expect(isExemptable('드리블셔틀런')).toBe(false)
    expect(isExemptable('골밑슛')).toBe(false)
    expect(isExemptable('자유투')).toBe(false)
  })

  it('NFD 분해형 자모로 들어와도 NFC 비교로 매칭한다', () => {
    expect(isExemptable('45도패스캐치'.normalize('NFD'))).toBe(true)
  })
})
