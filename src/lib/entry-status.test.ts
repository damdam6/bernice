import { describe, expect, it } from 'vitest'
import type { SessionEntry } from '../../shared/domain'
import { countCompleted, deriveEntryStatus } from './entry-status'

const EVENT_KEYS = ['드리블셔틀런', '골밑슛']

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
    expect(deriveEntryStatus(entry({}), EVENT_KEYS)).toBe('미입력')
  })

  it('일부만 unmeasured면 일부', () => {
    const e = entry({ 골밑슛: { status: 'recorded', value: 6, display: '6' } })
    expect(deriveEntryStatus(e, EVENT_KEYS)).toBe('일부')
  })

  it('전 종목이 unmeasured가 아니면(recorded/exempt 혼합) 완료', () => {
    const e = entry({
      드리블셔틀런: { status: 'recorded', value: 72, display: '1:12' },
      골밑슛: { status: 'exempt', value: null, display: null },
    })
    expect(deriveEntryStatus(e, EVENT_KEYS)).toBe('완료')
  })

  it('invalid도 "무언가 입력됨"으로 완료 판정에 포함된다', () => {
    const e = entry({
      드리블셔틀런: { status: 'invalid', value: null, display: '1:75', reason: '초 범위 초과' },
      골밑슛: { status: 'recorded', value: 6, display: '6' },
    })
    expect(deriveEntryStatus(e, EVENT_KEYS)).toBe('완료')
  })

  it('회차별 분모 판정: 4종목 회차 전부 입력이면 완료 (전역 종목 수와 무관)', () => {
    const fourEventKeys = ['A', 'B', 'C', 'D']
    const e: SessionEntry = {
      playerId: 1,
      name: '선수1',
      participated: true,
      scores: {
        A: { status: 'recorded', value: 1, display: '1' },
        B: { status: 'recorded', value: 2, display: '2' },
        C: { status: 'exempt', value: null, display: null },
        D: { status: 'invalid', value: null, display: '오류', reason: '범위 초과' },
      },
    }

    expect(deriveEntryStatus(e, fourEventKeys)).toBe('완료')
  })

  it('종목 추가 후 과거 회차 상태 불변: 신규 종목 key가 scores에 없어도(그 회차 eventKeys 밖) 판정이 흔들리지 않는다', () => {
    // 과거 회차는 A·B 2종목만 측정했다 — scores에는 A·B만 존재(계약상 신규 종목 C는 키 자체가 없음).
    const pastEventKeys = ['A', 'B']
    const blank: SessionEntry = {
      playerId: 1,
      name: '선수1',
      participated: false,
      scores: {
        A: { status: 'unmeasured', value: null, display: null },
        B: { status: 'unmeasured', value: null, display: null },
      },
    }
    const full: SessionEntry = {
      playerId: 2,
      name: '선수2',
      participated: true,
      scores: {
        A: { status: 'recorded', value: 1, display: '1' },
        B: { status: 'recorded', value: 2, display: '2' },
      },
    }

    // 신규 종목 C가 전역에 추가된 뒤에도 이 회차 자신의 eventKeys(A·B)만으로 판정하므로
    // 결과는 종목 추가 전과 동일하게 유지된다.
    expect(deriveEntryStatus(blank, pastEventKeys)).toBe('미입력')
    expect(deriveEntryStatus(full, pastEventKeys)).toBe('완료')
    expect(countCompleted([blank, full], pastEventKeys)).toBe(1)
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

    expect(countCompleted([done, partial, none], EVENT_KEYS)).toBe(1)
  })

  it('빈 배열이면 0', () => {
    expect(countCompleted([], EVENT_KEYS)).toBe(0)
  })
})
