import { describe, expect, it } from 'vitest'
import type { EventDefinition, RankDirection } from './domain'
import { buildEventScore } from './build-event-score'

// key·valueKind만 판정에 쓰이지만 타입 충족을 위해 나머지 필드도 채운다.
function ev(key: string, valueKind: 'count' | 'time', direction: RankDirection = '높을수록'): EventDefinition {
  return { key, valueKind, target: '0', targetValue: 0, maxScore: null, direction }
}

describe('buildEventScore', () => {
  it('시간 종목 셀 → recorded (normalizeScore seconds)', () => {
    expect(buildEventScore('1:12', ev('드리블셔틀런', 'time'))).toEqual({
      status: 'recorded',
      value: 72,
      display: '1:12',
    })
  })

  it('개수 종목 셀 → recorded (normalizeScore count)', () => {
    expect(buildEventScore('6', ev('골밑슛', 'count'))).toEqual({
      status: 'recorded',
      value: 6,
      display: '6',
    })
  })

  it('면제 → exempt (value/display 모두 null)', () => {
    expect(buildEventScore('면제', ev('45도패스캐치', 'count'))).toEqual({
      status: 'exempt',
      value: null,
      display: null,
    })
  })

  it('빈 문자열 → unmeasured', () => {
    expect(buildEventScore('', ev('자유투', 'count'))).toEqual({
      status: 'unmeasured',
      value: null,
      display: null,
    })
  })

  it('cell이 undefined면 unmeasured (null 취급)', () => {
    expect(buildEventScore(undefined, ev('자유투', 'count'))).toEqual({
      status: 'unmeasured',
      value: null,
      display: null,
    })
  })

  it('normalizeScore가 invalid로 판정한 값은 그대로 invalid + 원본·사유 보존', () => {
    const result = buildEventScore('1:75', ev('드리블셔틀런', 'time'))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') {
      expect(result.display).toBe('1:75')
      expect(result.reason).toEqual(expect.any(String))
    }
  })

  it('개수 종목 셀에 시간형 값(콜론 포함) → valueKind 불일치로 invalid', () => {
    const result = buildEventScore('1:15', ev('골밑슛', 'count'))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') {
      expect(result.display).toBe('1:15')
      expect(result.reason).toMatch(/종목 형식.*count.*입력 형식.*seconds/)
    }
  })

  it('시간 종목 셀에 개수형 값 → valueKind 불일치로 invalid', () => {
    const result = buildEventScore('6', ev('드리블셔틀런', 'time'))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') {
      expect(result.display).toBe('6')
      expect(result.reason).toMatch(/종목 형식.*time.*입력 형식.*count/)
    }
  })

  it('display는 원본 앞뒤 공백을 제거한다', () => {
    expect(buildEventScore('  6  ', ev('골밑슛', 'count'))).toEqual({
      status: 'recorded',
      value: 6,
      display: '6',
    })
  })
})
