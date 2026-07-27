import { describe, expect, it } from 'vitest'
import { isExemptable } from './exemptable-events'

describe('isExemptable', () => {
  it('패스 3종(체스트·바운드·원핸드)은 면제 가능', () => {
    expect(isExemptable('패스 - 체스트')).toBe(true)
    expect(isExemptable('패스 - 바운드')).toBe(true)
    expect(isExemptable('패스 - 원핸드')).toBe(true)
  })

  it('그 외 종목은 면제 불가(종료된 45도패스캐치 포함)', () => {
    expect(isExemptable('드리블셔틀런')).toBe(false)
    expect(isExemptable('골밑슛')).toBe(false)
    expect(isExemptable('자유투')).toBe(false)
    expect(isExemptable('볼 캐치')).toBe(false)
    expect(isExemptable('45도패스캐치')).toBe(false)
  })

  it('NFD 분해형 자모로 들어와도 NFC 비교로 매칭한다', () => {
    expect(isExemptable('패스 - 체스트'.normalize('NFD'))).toBe(true)
  })
})
