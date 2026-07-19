import { describe, expect, it } from 'vitest'
import type { EventDefinition, EventScore, RankDirection } from '../../shared/domain'
import { buildFieldRaw, initFieldState, initialInvalidNotice } from './player-input-field'

function ev(valueKind: 'count' | 'time', direction: RankDirection = '높을수록'): EventDefinition {
  return { key: '종목', valueKind, target: '0', targetValue: 0, maxScore: 10, direction }
}

const RECORDED_TIME: EventScore = { status: 'recorded', value: 72, display: '1:12' }
const RECORDED_COUNT: EventScore = { status: 'recorded', value: 6, display: '6' }
const EXEMPT: EventScore = { status: 'exempt', value: null, display: null }
const UNMEASURED: EventScore = { status: 'unmeasured', value: null, display: null }
const INVALID: EventScore = { status: 'invalid', value: null, display: '1:75', reason: '초 값이 범위를 벗어남 (0-59)' }

describe('initFieldState', () => {
  it('시간 종목 recorded → 분·초 필드에 복원', () => {
    expect(initFieldState(ev('time'), RECORDED_TIME)).toEqual({
      valueKind: 'time',
      minutes: '1',
      seconds: '12',
      exempt: false,
    })
  })

  it('전각 콜론·전각 숫자가 남은 display도 NFKC로 반각 변환해 복원', () => {
    const legacy: EventScore = { status: 'recorded', value: 75, display: '１：15' }
    expect(initFieldState(ev('time'), legacy)).toEqual({
      valueKind: 'time',
      minutes: '1',
      seconds: '15',
      exempt: false,
    })
  })

  it('시간 종목 unmeasured → 빈 필드', () => {
    expect(initFieldState(ev('time'), UNMEASURED)).toEqual({
      valueKind: 'time',
      minutes: '',
      seconds: '',
      exempt: false,
    })
  })

  it('시간 종목 invalid → 빈 필드(원본은 initialInvalidNotice가 별도 안내)', () => {
    expect(initFieldState(ev('time'), INVALID)).toEqual({
      valueKind: 'time',
      minutes: '',
      seconds: '',
      exempt: false,
    })
  })

  it('시간 종목 exempt → 빈 필드 + exempt true', () => {
    expect(initFieldState(ev('time'), EXEMPT)).toEqual({
      valueKind: 'time',
      minutes: '',
      seconds: '',
      exempt: true,
    })
  })

  it('개수 종목 recorded → count 필드에 복원', () => {
    expect(initFieldState(ev('count'), RECORDED_COUNT)).toEqual({
      valueKind: 'count',
      count: '6',
      exempt: false,
    })
  })

  it('개수 종목 exempt → 빈 count + exempt true', () => {
    expect(initFieldState(ev('count'), EXEMPT)).toEqual({
      valueKind: 'count',
      count: '',
      exempt: true,
    })
  })

  it('개수 종목 unmeasured/invalid → 빈 count', () => {
    expect(initFieldState(ev('count'), UNMEASURED)).toEqual({ valueKind: 'count', count: '', exempt: false })
    expect(initFieldState(ev('count'), INVALID)).toEqual({ valueKind: 'count', count: '', exempt: false })
  })
})

describe('initialInvalidNotice', () => {
  it('invalid가 아니면 null', () => {
    expect(initialInvalidNotice(RECORDED_TIME)).toBeNull()
    expect(initialInvalidNotice(EXEMPT)).toBeNull()
    expect(initialInvalidNotice(UNMEASURED)).toBeNull()
  })

  it('invalid면 원본·사유를 보존', () => {
    expect(initialInvalidNotice(INVALID)).toEqual({ display: '1:75', reason: '초 값이 범위를 벗어남 (0-59)' })
  })
})

describe('buildFieldRaw', () => {
  it('exempt면 valueKind와 무관하게 "면제"', () => {
    expect(buildFieldRaw({ valueKind: 'time', minutes: '1', seconds: '12', exempt: true })).toBe('면제')
    expect(buildFieldRaw({ valueKind: 'count', count: '6', exempt: true })).toBe('면제')
  })

  it('시간 필드 — 분·초 모두 채워지면 mm:ss 조립', () => {
    expect(buildFieldRaw({ valueKind: 'time', minutes: '1', seconds: '05', exempt: false })).toBe('1:05')
  })

  it('시간 필드 — 분·초 둘 다 비면 빈 문자열(미측정)', () => {
    expect(buildFieldRaw({ valueKind: 'time', minutes: '', seconds: '', exempt: false })).toBe('')
  })

  it('시간 필드 — 한쪽만 채워지면 불완전한 문자열 그대로(서버/normalizeScore가 invalid로 판정)', () => {
    expect(buildFieldRaw({ valueKind: 'time', minutes: '5', seconds: '', exempt: false })).toBe('5:')
    expect(buildFieldRaw({ valueKind: 'time', minutes: '', seconds: '5', exempt: false })).toBe(':5')
  })

  it('개수 필드 — count 문자열 그대로', () => {
    expect(buildFieldRaw({ valueKind: 'count', count: '6', exempt: false })).toBe('6')
    expect(buildFieldRaw({ valueKind: 'count', count: '', exempt: false })).toBe('')
  })
})
