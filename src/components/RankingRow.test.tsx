// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EventDefinition } from '../../shared/domain'
import type { PerformanceScale } from '../lib/performance-scale'
import type { RankingRowDatum } from '../lib/ranking-view'
import { RankingRow } from './RankingRow'

afterEach(cleanup)

const scale: PerformanceScale = { normalize: () => 0.5 }

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

describe('RankingRow', () => {
  it('recorded — 순위 숫자·이름·달성 뱃지·성능바·"/만점" 병기를 렌더한다', () => {
    const row: RankingRowDatum = { status: 'recorded', playerId: 1, name: '선수1', rank: 2, value: 6, display: '6', achieved: true }
    render(<RankingRow row={row} event={countEvent()} scale={scale} tiedRanks={new Set()} />)

    expect(screen.getByText('2위')).toBeInTheDocument()
    expect(screen.getByText('선수1')).toBeInTheDocument()
    expect(screen.getByText('달성')).toBeInTheDocument()
    expect(screen.getByText('6 / 10')).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('recorded — 공동순위면 "공동 N위"로 표기하고 primary로 강조한다', () => {
    const row: RankingRowDatum = { status: 'recorded', playerId: 1, name: '선수1', rank: 1, value: 6, display: '6', achieved: true }
    render(<RankingRow row={row} event={countEvent()} scale={scale} tiedRanks={new Set([1])} />)

    const rankEl = screen.getByText('공동 1위')
    expect(rankEl.className).toContain('text-primary')
  })

  it('recorded — 1위가 아니면 강조하지 않는다', () => {
    const row: RankingRowDatum = { status: 'recorded', playerId: 1, name: '선수1', rank: 2, value: 6, display: '6', achieved: false }
    render(<RankingRow row={row} event={countEvent()} scale={scale} tiedRanks={new Set()} />)

    expect(screen.getByText('2위').className).not.toContain('text-primary')
  })

  it('recorded — maxScore 없으면 "/만점" 병기 없이 원값만 보여준다', () => {
    const row: RankingRowDatum = { status: 'recorded', playerId: 1, name: '선수1', rank: 1, value: 77, display: '1:17', achieved: true }
    render(<RankingRow row={row} event={countEvent({ valueKind: 'time', maxScore: null })} scale={scale} tiedRanks={new Set()} />)

    expect(screen.getByText('1:17')).toBeInTheDocument()
  })

  it('exempt — 순위 자리·뱃지 모두 "면제", 값은 "–", 성능바는 없다', () => {
    const row: RankingRowDatum = { status: 'exempt', playerId: 2, name: '선수2' }
    render(<RankingRow row={row} event={countEvent()} scale={scale} tiedRanks={new Set()} />)

    expect(screen.getAllByText('면제')).toHaveLength(2)
    expect(screen.getByText('–')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('unmeasured — 순위 자리 "—", 뱃지 "미측정", 값 "–"', () => {
    const row: RankingRowDatum = { status: 'unmeasured', playerId: 3, name: '선수3' }
    render(<RankingRow row={row} event={countEvent()} scale={scale} tiedRanks={new Set()} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('미측정')).toBeInTheDocument()
    expect(screen.getByText('–')).toBeInTheDocument()
  })

  it('invalid — 순위 자리 "—", 뱃지 "이상값", 값은 원본 표기 그대로', () => {
    const row: RankingRowDatum = { status: 'invalid', playerId: 4, name: '선수4', display: '1:75' }
    render(<RankingRow row={row} event={countEvent()} scale={scale} tiedRanks={new Set()} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('이상값')).toBeInTheDocument()
    expect(screen.getByText('1:75')).toBeInTheDocument()
  })
})
