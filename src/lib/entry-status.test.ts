import { describe, expect, it } from 'vitest'
import type { EventDefinition, SessionEntry } from '../../shared/domain'
import { countCompleted, deriveEntryStatus } from './entry-status'

const EVENTS: EventDefinition[] = [
  { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
  { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
]

function entry(overrides: Partial<SessionEntry['scores']>): SessionEntry {
  return {
    playerId: 1,
    name: '선수1',
    participated: true,
    scores: {
      드리블셔틀런: { status: 'unmeasured', value: null, display: null },
      골밑슛: { status: 'unmeasured', value: null, display: null },
      ...overrides,
    },
  }
}

describe('deriveEntryStatus', () => {
  it('전 종목이 unmeasured면 미입력', () => {
    expect(deriveEntryStatus(entry({}), EVENTS)).toBe('미입력')
  })

  it('일부만 unmeasured면 일부', () => {
    const e = entry({ 골밑슛: { status: 'recorded', value: 6, display: '6' } })
    expect(deriveEntryStatus(e, EVENTS)).toBe('일부')
  })

  it('전 종목이 unmeasured가 아니면(recorded/exempt 혼합) 완료', () => {
    const e = entry({
      드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
      골밑슛: { status: 'exempt', value: null, display: null },
    })
    expect(deriveEntryStatus(e, EVENTS)).toBe('완료')
  })

  it('invalid도 "무언가 입력됨"으로 완료 판정에 포함된다', () => {
    const e = entry({
      드리블셔틀런: { status: 'invalid', value: null, display: '1:75', reason: '초 범위 초과' },
      골밑슛: { status: 'recorded', value: 6, display: '6' },
    })
    expect(deriveEntryStatus(e, EVENTS)).toBe('완료')
  })
})

describe('countCompleted', () => {
  it('완료 상태인 엔트리 수만 센다', () => {
    const done = entry({
      드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
      골밑슛: { status: 'recorded', value: 6, display: '6' },
    })
    const partial = entry({ 골밑슛: { status: 'recorded', value: 6, display: '6' } })
    const none = entry({})

    expect(countCompleted([done, partial, none], EVENTS)).toBe(1)
  })

  it('빈 배열이면 0', () => {
    expect(countCompleted([], EVENTS)).toBe(0)
  })
})
