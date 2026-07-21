import { describe, expect, it } from 'vitest'
import type { EventDefinition, PlayerSummary, Session } from '../../shared/domain'
import { buildPerformanceScale } from './performance-scale'
import {
  buildGrowthCards,
  buildRadarAxes,
  buildSessionLabels,
  buildTrendSeries,
} from './profile-view'

// 종목 2개(개수+만점 있음 높을수록 / 시간+만점 없음 낮을수록) × 회차 3개.
// 회차별로 첫 기록·개선·동률·악화 델타가 모두 나오도록 값을 짰다.
const EVENTS: EventDefinition[] = [
  { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
  { key: '셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
]

const SESSIONS: Session[] = [
  {
    date: '2026-06-01',
    entries: [
      {
        playerId: 1,
        name: '선수1',
        participated: true,
        scores: {
          골밑슛: { status: 'recorded', value: 6, display: '6' },
          셔틀런: { status: 'recorded', value: 90, display: '1:30' },
        },
      },
      {
        playerId: 2,
        name: '선수2',
        participated: true,
        scores: {
          골밑슛: { status: 'recorded', value: 4, display: '4' },
          셔틀런: { status: 'recorded', value: 100, display: '1:40' },
        },
      },
    ],
  },
  {
    date: '2026-06-08',
    entries: [
      {
        playerId: 1,
        name: '선수1',
        participated: true,
        scores: {
          골밑슛: { status: 'recorded', value: 8, display: '8' },
          셔틀런: { status: 'recorded', value: 80, display: '1:20' },
        },
      },
      {
        playerId: 2,
        name: '선수2',
        participated: true,
        scores: {
          골밑슛: { status: 'exempt', value: null, display: null },
          셔틀런: { status: 'recorded', value: 95, display: '1:35' },
        },
      },
    ],
  },
  {
    date: '2026-06-15',
    entries: [
      {
        playerId: 1,
        name: '선수1',
        participated: true,
        scores: {
          골밑슛: { status: 'recorded', value: 8, display: '8' },
          셔틀런: { status: 'recorded', value: 85, display: '1:25' },
        },
      },
      {
        playerId: 2,
        name: '선수2',
        participated: true,
        scores: {
          골밑슛: { status: 'unmeasured', value: null, display: null },
          셔틀런: { status: 'recorded', value: 90, display: '1:30' },
        },
      },
    ],
  },
]

const PLAYER1: PlayerSummary = {
  id: 1,
  name: '선수1',
  status: '활동',
  trends: [
    {
      event: '골밑슛',
      points: [
        { sessionDate: '2026-06-01', value: 6, display: '6', achieved: true, deltaFromPrevious: null, improved: null },
        { sessionDate: '2026-06-08', value: 8, display: '8', achieved: true, deltaFromPrevious: 2, improved: true },
        { sessionDate: '2026-06-15', value: 8, display: '8', achieved: true, deltaFromPrevious: 0, improved: false },
      ],
    },
    {
      event: '셔틀런',
      points: [
        { sessionDate: '2026-06-01', value: 90, display: '1:30', achieved: false, deltaFromPrevious: null, improved: null },
        { sessionDate: '2026-06-08', value: 80, display: '1:20', achieved: false, deltaFromPrevious: -10, improved: true },
        { sessionDate: '2026-06-15', value: 85, display: '1:25', achieved: false, deltaFromPrevious: 5, improved: false },
      ],
    },
  ],
  personalBests: [
    { event: '골밑슛', value: 8, display: '8', sessionDate: '2026-06-08', achieved: true },
    { event: '셔틀런', value: 80, display: '1:20', sessionDate: '2026-06-08', achieved: false },
  ],
}

const PLAYER2: PlayerSummary = {
  id: 2,
  name: '선수2',
  status: '활동',
  trends: [
    {
      event: '골밑슛',
      // 2차 면제·3차 미측정이라 유효 기록은 1차 하나뿐(스파스)
      points: [
        { sessionDate: '2026-06-01', value: 4, display: '4', achieved: false, deltaFromPrevious: null, improved: null },
      ],
    },
    {
      event: '셔틀런',
      points: [
        { sessionDate: '2026-06-01', value: 100, display: '1:40', achieved: false, deltaFromPrevious: null, improved: null },
        { sessionDate: '2026-06-08', value: 95, display: '1:35', achieved: false, deltaFromPrevious: -5, improved: true },
        { sessionDate: '2026-06-15', value: 90, display: '1:30', achieved: false, deltaFromPrevious: -5, improved: true },
      ],
    },
  ],
  personalBests: [
    { event: '골밑슛', value: 4, display: '4', sessionDate: '2026-06-01', achieved: false },
    { event: '셔틀런', value: 90, display: '1:30', sessionDate: '2026-06-15', achieved: false },
  ],
}

const PLAYERS = [PLAYER1, PLAYER2]
const scale = buildPerformanceScale(EVENTS, SESSIONS)
const sessionByDate = (date: string) => SESSIONS.find((s) => s.date === date)

describe('buildSessionLabels', () => {
  it('날짜 오름차순 index+1 → "n차"', () => {
    expect(buildSessionLabels(SESSIONS)).toEqual(['1차', '2차', '3차'])
    expect(buildSessionLabels([])).toEqual([])
  })
})

describe('buildRadarAxes', () => {
  it('recorded는 공유 scale로 정규화한다 (개수=value/max, 시간=범위 스케일)', () => {
    // 셔틀런 관측 범위 = 80~100(전 선수·전 회차) → 낮을수록 정규화 1-(v-80)/20
    const axes = buildRadarAxes(EVENTS, sessionByDate('2026-06-08'), 1, scale)
    expect(axes).toEqual([
      { label: '골밑슛', value: 0.8 }, // 8/10
      { label: '셔틀런', value: 1 }, // 1-(80-80)/20
    ])
  })

  it('recorded가 아닌 종목(면제·미측정)은 0으로 둔다', () => {
    const axes = buildRadarAxes(EVENTS, sessionByDate('2026-06-08'), 2, scale)
    expect(axes[0]).toEqual({ label: '골밑슛', value: 0 }) // 면제 → 0
    expect(axes[1]).toEqual({ label: '셔틀런', value: 0.25 }) // 1-(95-80)/20
  })

  it('그 회차에 엔트리가 없는 선수는 전 축 0', () => {
    const axes = buildRadarAxes(EVENTS, sessionByDate('2026-06-08'), 999, scale)
    expect(axes.map((a) => a.value)).toEqual([0, 0])
  })
})

describe('buildGrowthCards', () => {
  it('PB·현재값·델타를 종목 순서대로 만든다', () => {
    const cards = buildGrowthCards(EVENTS, sessionByDate('2026-06-15'), PLAYER1)
    expect(cards.map((c) => c.eventKey)).toEqual(['골밑슛', '셔틀런'])
    expect(cards[0]).toMatchObject({ label: '골밑슛', pb: '8', value: '8' })
    expect(cards[1]).toMatchObject({ label: '셔틀런', pb: '1:20', value: '1:25' })
  })

  it('첫 기록 회차의 델타는 "—" 회색', () => {
    const cards = buildGrowthCards(EVENTS, sessionByDate('2026-06-01'), PLAYER1)
    expect(cards[0].delta).toEqual({ text: '—', tone: 'muted' })
    expect(cards[1].delta).toEqual({ text: '—', tone: 'muted' })
  })

  it('개선 델타 — ▲ + green(up), 시간 종목은 "초" 접미', () => {
    const cards = buildGrowthCards(EVENTS, sessionByDate('2026-06-08'), PLAYER1)
    expect(cards[0].delta).toEqual({ text: '▲ 2', tone: 'up' }) // 개수
    expect(cards[1].delta).toEqual({ text: '▲ 10초', tone: 'up' }) // 시간
  })

  it('동률 델타는 "─ 0" 회색, 악화 델타는 ▼ + red(down)', () => {
    const cards = buildGrowthCards(EVENTS, sessionByDate('2026-06-15'), PLAYER1)
    expect(cards[0].delta).toEqual({ text: '─ 0', tone: 'muted' }) // 8→8 동률
    expect(cards[1].delta).toEqual({ text: '▼ 5초', tone: 'down' }) // 80→85 악화
  })

  it('면제·미측정 현재값과, 그 회차 유효 기록이 없는 델타', () => {
    const exemptCards = buildGrowthCards(EVENTS, sessionByDate('2026-06-08'), PLAYER2)
    expect(exemptCards[0].value).toBe('면제')
    expect(exemptCards[0].delta).toEqual({ text: '—', tone: 'muted' }) // 2차 골밑슛 유효 기록 없음

    const unmeasuredCards = buildGrowthCards(EVENTS, sessionByDate('2026-06-15'), PLAYER2)
    expect(unmeasuredCards[0].value).toBe('—')
  })

  it('PB가 없는 종목은 "—" (스파스)', () => {
    const noRecord: PlayerSummary = { id: 3, name: '선수3', status: '활동', trends: [], personalBests: [] }
    const cards = buildGrowthCards(EVENTS, sessionByDate('2026-06-01'), noRecord)
    expect(cards.map((c) => c.pb)).toEqual(['—', '—'])
    expect(cards.map((c) => c.value)).toEqual(['—', '—'])
    expect(cards.map((c) => c.delta.text)).toEqual(['—', '—'])
  })
})

describe('buildTrendSeries', () => {
  it('본인은 highlight, 나머지는 background(본인 제외) — 회차 인덱스로 매핑·정규화', () => {
    const series = buildTrendSeries(EVENTS[0], SESSIONS, PLAYERS, 1, scale)
    expect(series.highlight).toEqual([
      { sessionIndex: 0, value: 0.6 }, // 6/10
      { sessionIndex: 1, value: 0.8 },
      { sessionIndex: 2, value: 0.8 },
    ])
    // 배경은 선수2의 골밑슛 1점(1차)만 — 본인(선수1) 제외
    expect(series.background).toEqual([[{ sessionIndex: 0, value: 0.4 }]])
    expect(series.goal).toBe(0.5) // 목표 5/10
  })

  it('유효 기록이 없는 선수의 배경 시리즈는 제외한다', () => {
    const empty: PlayerSummary = { id: 3, name: '선수3', status: '활동', trends: [], personalBests: [] }
    const series = buildTrendSeries(EVENTS[0], SESSIONS, [PLAYER1, empty], 1, scale)
    expect(series.background).toEqual([]) // 선수3은 골밑슛 point 0개 → 제외
  })

  it('본인이 목록에 없으면 highlight는 빈 배열', () => {
    const series = buildTrendSeries(EVENTS[0], SESSIONS, PLAYERS, 999, scale)
    expect(series.highlight).toEqual([])
  })
})
