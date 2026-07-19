import { describe, expect, it } from 'vitest'
import { formatSeoulDate } from './seoul-date'

describe('formatSeoulDate', () => {
  it('UTC 시각을 KST(UTC+9) 기준 날짜로 변환한다', () => {
    // 2025-08-16 03:00 UTC = 2025-08-16 12:00 KST
    expect(formatSeoulDate(new Date('2025-08-16T03:00:00Z'))).toBe('2025-08-16')
  })

  it('자정 경계: UTC 15:00은 KST 익일 00:00이라 날짜가 하루 넘어간다', () => {
    expect(formatSeoulDate(new Date('2025-08-15T15:00:00Z'))).toBe('2025-08-16')
    // 1초 전(14:59:59Z = KST 23:59:59)은 아직 전날
    expect(formatSeoulDate(new Date('2025-08-15T14:59:59Z'))).toBe('2025-08-15')
  })

  it('월말 넘김: KST로 다음 달 1일이 된다', () => {
    expect(formatSeoulDate(new Date('2025-08-31T15:00:00Z'))).toBe('2025-09-01')
  })

  it('연말 넘김: KST로 다음 해 1월 1일이 된다', () => {
    expect(formatSeoulDate(new Date('2025-12-31T15:00:00Z'))).toBe('2026-01-01')
  })

  it('한 자리 월/일은 zero-pad한다', () => {
    // 2025-01-04 16:00 UTC = 2025-01-05 01:00 KST
    expect(formatSeoulDate(new Date('2025-01-04T16:00:00Z'))).toBe('2025-01-05')
  })
})
