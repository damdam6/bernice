import { describe, expect, it } from 'vitest'
import { normalizeStatus, type StatusValue } from './normalize-status'

describe('normalizeStatus', () => {
  const knownCases: Array<{ label: string; raw: string; expected: StatusValue }> = [
    { label: '활동', raw: '활동', expected: { kind: 'known', value: '활동' } },
    { label: '탈퇴', raw: '탈퇴', expected: { kind: 'known', value: '탈퇴' } },
    { label: '비대상', raw: '비대상', expected: { kind: 'known', value: '비대상' } },
    { label: '휴식', raw: '휴식', expected: { kind: 'known', value: '휴식' } },
    { label: '앞뒤 공백 포함 활동', raw: '  활동  ', expected: { kind: 'known', value: '활동' } },
    { label: '탭·개행 포함 탈퇴', raw: '\t탈퇴\n', expected: { kind: 'known', value: '탈퇴' } },
    {
      label: 'NFD 분해형 자모 비대상',
      raw: '비대상'.normalize('NFD'),
      expected: { kind: 'known', value: '비대상' },
    },
  ]

  it.each(knownCases)('$label → known', ({ raw, expected }) => {
    expect(normalizeStatus(raw)).toEqual(expected)
  })

  describe('미지의 값 → unknown (throw 하지 않고 값으로 표현)', () => {
    const unknownRaws = [
      'Active', // 영문
      '활동됨', // 오탈자/변형
      '정지', // 4종에 없는 값
      '휴식중', // 4종 중 하나를 포함하지만 정확히 일치하지 않는 값
    ]

    it.each(unknownRaws)('%s', (raw) => {
      const result = normalizeStatus(raw)
      expect(result).toEqual({ kind: 'unknown', raw })
    })

    it('빈 문자열 → unknown', () => {
      expect(normalizeStatus('')).toEqual({ kind: 'unknown', raw: '' })
    })

    it('undefined → unknown (raw는 빈 문자열로 정규화)', () => {
      expect(normalizeStatus(undefined)).toEqual({ kind: 'unknown', raw: '' })
    })

    it('null → unknown (raw는 빈 문자열로 정규화)', () => {
      expect(normalizeStatus(null)).toEqual({ kind: 'unknown', raw: '' })
    })
  })

  it('unknown 값은 트림 전 원본 문자열을 raw로 보존한다', () => {
    expect(normalizeStatus('  정지  ')).toEqual({ kind: 'unknown', raw: '  정지  ' })
  })
})
