import { describe, expect, it } from 'vitest'
import type { EventDefinition, EventScore, Session } from '../../shared/domain'
import { buildPerformanceScale, clamp01 } from './performance-scale'

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

function countEvent(overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    key: '골밑슛',
    valueKind: 'count',
    target: '5',
    targetValue: 5,
    maxScore: 10,
    direction: '높을수록',
    ...overrides,
  }
}

function timeEvent(overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    key: '셔틀런',
    valueKind: 'time',
    target: '1:17',
    targetValue: 77,
    maxScore: null,
    direction: '낮을수록',
    ...overrides,
  }
}

function recorded(value: number): EventScore {
  return { status: 'recorded', value, display: String(value) }
}

/** 종목 1개에 대해 선수 1명·회차 1개 = 값 1개 꼴로 세션을 구성한다. */
function sessionsWithValues(eventKey: string, values: Array<number | EventScore>): Session[] {
  return values.map((v, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    entries: [
      {
        playerId: 1,
        name: '선수',
        scores: { [eventKey]: typeof v === 'number' ? recorded(v) : v },
        participated: true,
      },
    ],
  }))
}

// ── clamp01 ─────────────────────────────────────────────────────────────────

describe('clamp01', () => {
  it('0~1 안의 값은 그대로, 밖의 값은 경계로 클램프', () => {
    expect(clamp01(0.3)).toBe(0.3)
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(1.7)).toBe(1)
  })

  it('NaN은 0으로 방어', () => {
    expect(clamp01(Number.NaN)).toBe(0)
  })
})

// ── 개수 종목: value / maxScore ──────────────────────────────────────────────

describe('개수 종목 (만점 + 높을수록)', () => {
  const scale = buildPerformanceScale([countEvent()], sessionsWithValues('골밑슛', [3, 7]))

  it('value / maxScore', () => {
    expect(scale.normalize('골밑슛', 5)).toBe(0.5)
    expect(scale.normalize('골밑슛', 10)).toBe(1)
    expect(scale.normalize('골밑슛', 0)).toBe(0)
  })

  it('만점 초과·음수는 0~1로 클램프', () => {
    expect(scale.normalize('골밑슛', 12)).toBe(1)
    expect(scale.normalize('골밑슛', -1)).toBe(0)
  })

  it('관측 범위(3~7)가 아니라 만점이 분모 — 범위 스케일과 무관', () => {
    expect(scale.normalize('골밑슛', 7)).toBe(0.7)
  })
})

// ── 시간 종목: 전체 데이터 min~max 범위 스케일 + 방향 반전 ────────────────────

describe('시간 종목 (범위 스케일 + 낮을수록 반전)', () => {
  const scale = buildPerformanceScale([timeEvent()], sessionsWithValues('셔틀런', [64, 77, 90]))

  it('최소(가장 빠름) = 1, 최대(가장 느림) = 0', () => {
    expect(scale.normalize('셔틀런', 64)).toBe(1)
    expect(scale.normalize('셔틀런', 90)).toBe(0)
    expect(scale.normalize('셔틀런', 77)).toBe(0.5)
  })

  it('목표선이 관측 범위 밖이면 0/1로 클램프', () => {
    expect(scale.normalize('셔틀런', 60)).toBe(1) // 전원보다 빠른 목표 → 상단
    expect(scale.normalize('셔틀런', 95)).toBe(0) // 전원보다 느린 값 → 하단
  })

  it('recorded만 범위에 집계 — 면제·미측정·이상값은 제외', () => {
    const withNoise = buildPerformanceScale(
      [timeEvent()],
      sessionsWithValues('셔틀런', [
        64,
        90,
        { status: 'exempt', value: null, display: null },
        { status: 'unmeasured', value: null, display: null },
        { status: 'invalid', value: null, display: '1:75', reason: '초 범위 초과' },
      ]),
    )
    expect(withNoise.normalize('셔틀런', 64)).toBe(1)
    expect(withNoise.normalize('셔틀런', 90)).toBe(0)
  })
})

describe('범위 스케일 (높을수록)', () => {
  it('만점 없는 개수 종목은 범위 스케일 — 최대 = 1', () => {
    const event = countEvent({ key: '팔굽혀펴기', maxScore: null })
    const scale = buildPerformanceScale([event], sessionsWithValues('팔굽혀펴기', [10, 30]))
    expect(scale.normalize('팔굽혀펴기', 30)).toBe(1)
    expect(scale.normalize('팔굽혀펴기', 10)).toBe(0)
    expect(scale.normalize('팔굽혀펴기', 20)).toBe(0.5)
  })

  it('만점이 있어도 낮을수록면 범위 스케일로 폴백 (의미 역전 방지)', () => {
    const event = countEvent({ key: '실책', direction: '낮을수록' })
    const scale = buildPerformanceScale([event], sessionsWithValues('실책', [0, 4]))
    expect(scale.normalize('실책', 0)).toBe(1)
    expect(scale.normalize('실책', 4)).toBe(0)
  })
})

// ── 중립 0.5 엣지 ────────────────────────────────────────────────────────────

describe('중립 0.5 엣지', () => {
  it('관측값 전원 동률(min == max) → 0.5', () => {
    const scale = buildPerformanceScale([timeEvent()], sessionsWithValues('셔틀런', [70, 70]))
    expect(scale.normalize('셔틀런', 70)).toBe(0.5)
    expect(scale.normalize('셔틀런', 77)).toBe(0.5) // 목표선도 동일 규칙
  })

  it('관측값 0건 종목 → 0.5', () => {
    const scale = buildPerformanceScale([timeEvent()], [])
    expect(scale.normalize('셔틀런', 77)).toBe(0.5)
  })

  it('모르는 종목 키 · 비정상 값 → 0.5', () => {
    const scale = buildPerformanceScale([countEvent()], sessionsWithValues('골밑슛', [3]))
    expect(scale.normalize('없는종목', 5)).toBe(0.5)
    expect(scale.normalize('골밑슛', Number.NaN)).toBe(0.5)
    expect(scale.normalize('골밑슛', Number.POSITIVE_INFINITY)).toBe(0.5)
  })
})
