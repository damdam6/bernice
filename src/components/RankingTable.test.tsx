// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RankingTable, { type RankingTableRow } from './RankingTable'

afterEach(cleanup)

function recordedRow(params: {
  playerId: number
  name?: string
  value: number
  display: string
  rank: number
  achieved: boolean
}): RankingTableRow {
  const { playerId, name = `선수${playerId}`, value, display, rank, achieved } = params
  return { status: 'recorded', playerId, name, value, display, rank, achieved }
}

function exemptRow(playerId: number, name = `선수${playerId}`): RankingTableRow {
  return { status: 'exempt', playerId, name }
}

function unmeasuredRow(playerId: number, name = `선수${playerId}`): RankingTableRow {
  return { status: 'unmeasured', playerId, name }
}

describe('RankingTable', () => {
  it('동순위(1,1,3)·면제·미측정이 섞인 목데이터를 올바르게 렌더한다', () => {
    const entries: RankingTableRow[] = [
      recordedRow({ playerId: 1, rank: 1, value: 70, display: '1:10', achieved: true }),
      recordedRow({ playerId: 2, rank: 1, value: 70, display: '1:10', achieved: true }),
      recordedRow({ playerId: 3, rank: 3, value: 80, display: '1:20', achieved: false }),
      exemptRow(4),
      unmeasuredRow(5),
    ]

    render(<RankingTable entries={entries} direction="낮을수록" />)

    expect(screen.getAllByText('공동 1위')).toHaveLength(2)
    expect(screen.getByText('3위')).toBeInTheDocument()
    expect(screen.getByText('면제')).toBeInTheDocument()
    expect(screen.getByText('미측정')).toBeInTheDocument()
    expect(screen.getAllByText('달성', { selector: 'span' })).toHaveLength(2)
  })

  it('낮을수록 방향이면 ↓ 문구를 보여준다', () => {
    render(
      <RankingTable
        entries={[recordedRow({ playerId: 1, rank: 1, value: 1, display: '1', achieved: true })]}
        direction="낮을수록"
      />,
    )

    expect(screen.getByText('↓ 낮을수록 좋음')).toBeInTheDocument()
  })

  it('높을수록 방향이면 ↑ 문구를 보여준다', () => {
    render(
      <RankingTable
        entries={[recordedRow({ playerId: 1, rank: 1, value: 1, display: '1', achieved: true })]}
        direction="높을수록"
      />,
    )

    expect(screen.getByText('↑ 높을수록 좋음')).toBeInTheDocument()
  })

  it('entries가 비어 있으면 안내 문구를 렌더하고 표는 그리지 않는다', () => {
    render(<RankingTable entries={[]} direction="낮을수록" />)

    expect(screen.getByText('표시할 기록이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
