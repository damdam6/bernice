import { describe, expect, it } from 'vitest'
import { normalizeScore, type ScoreValue } from './normalize-score'

describe('normalizeScore', () => {
  const cases: Array<{ label: string; raw: string; expected: ScoreValue }> = [
    { label: '시간형 1:15 → 75초', raw: '1:15', expected: { kind: 'seconds', value: 75, raw: '1:15' } },
    { label: '시간형 0:59 → 59초 (경계값)', raw: '0:59', expected: { kind: 'seconds', value: 59, raw: '0:59' } },
    { label: '시간형 1:05 → 65초 (초 앞자리 0)', raw: '1:05', expected: { kind: 'seconds', value: 65, raw: '1:05' } },
    { label: '시간형 10:00 → 600초', raw: '10:00', expected: { kind: 'seconds', value: 600, raw: '10:00' } },
    { label: '개수형 6', raw: '6', expected: { kind: 'count', value: 6, raw: '6' } },
    { label: '개수형 0', raw: '0', expected: { kind: 'count', value: 0, raw: '0' } },
    { label: '개수형 21', raw: '21', expected: { kind: 'count', value: 21, raw: '21' } },
    { label: '면제', raw: '면제', expected: { kind: 'exempt', raw: '면제' } },
    { label: '면제 (앞뒤 공백)', raw: '  면제  ', expected: { kind: 'exempt', raw: '  면제  ' } },
    {
      label: '면제 (NFD 분해형 자모)',
      raw: '면제'.normalize('NFD'),
      expected: { kind: 'exempt', raw: '면제'.normalize('NFD') },
    },
    { label: '빈 문자열 → blank', raw: '', expected: { kind: 'blank' } },
    { label: '공백만 → blank', raw: '   ', expected: { kind: 'blank' } },
  ]

  it.each(cases)('$label', ({ raw, expected }) => {
    expect(normalizeScore(raw)).toEqual(expected)
  })

  it('undefined → blank', () => {
    expect(normalizeScore(undefined)).toEqual({ kind: 'blank' })
  })

  it('null → blank', () => {
    expect(normalizeScore(null)).toEqual({ kind: 'blank' })
  })

  describe('이상값 → invalid (throw 하지 않고 값으로 표현)', () => {
    const invalidRaws = [
      '-1', // 음수 개수
      '6.5', // 소수 개수
      '1:75', // 초 범위(60 이상) 초과
      '1:5:30', // 콜론 2개 (mm:ss 아님)
      'abc', // 문자 쓰레기값
      ':15', // 분 없음
      '1:', // 초 없음
      '1:1a', // 초 부분에 문자 섞임
    ]

    it.each(invalidRaws)('%s', (raw) => {
      expect(normalizeScore(raw)).toEqual({
        kind: 'invalid',
        raw,
        reason: expect.any(String),
      })
    })
  })
})
