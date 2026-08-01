// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TrendLegend } from './trend-legend'

afterEach(cleanup)

// 라벨 텍스트로 항목을 잡아 그 안의 마커 SVG를 되돌려준다 — 색 어서션이 순서가 아니라
// 의미(어떤 항목의 마커인지)에 걸리게 하려는 것.
function marker(label: string): SVGSVGElement {
  return screen.getByText(label).querySelector('svg') as SVGSVGElement
}

describe('TrendLegend', () => {
  it('본인·팀원·목표 3항목을 렌더한다', () => {
    render(<TrendLegend />)

    expect(screen.getByText('본인')).toBeInTheDocument()
    expect(screen.getByText('팀원')).toBeInTheDocument()
    expect(screen.getByText('목표')).toBeInTheDocument()
  })

  it('마커 색이 차트 라인 토큰과 일치한다 (primary / primary-soft / good, §07)', () => {
    render(<TrendLegend />)

    // 본인 = 굵은 선 + 도트 → stroke·fill 양쪽이 primary
    expect(marker('본인').querySelector('line')?.getAttribute('class')).toBe('stroke-primary')
    expect(marker('본인').querySelector('circle')?.getAttribute('class')).toBe('fill-primary')
    expect(marker('팀원').querySelector('line')?.getAttribute('class')).toBe('stroke-primary-soft')
    expect(marker('목표').querySelector('line')?.getAttribute('class')).toBe('stroke-good')
  })

  it('목표 마커만 점선이다', () => {
    render(<TrendLegend />)

    expect(marker('목표').querySelector('line')).toHaveAttribute('stroke-dasharray')
    expect(marker('본인').querySelector('line')).not.toHaveAttribute('stroke-dasharray')
    expect(marker('팀원').querySelector('line')).not.toHaveAttribute('stroke-dasharray')
  })

  it('접근성 — 마커는 aria-hidden, 묶음에는 범례 라벨', () => {
    const { container } = render(<TrendLegend />)

    for (const label of ['본인', '팀원', '목표']) {
      expect(marker(label)).toHaveAttribute('aria-hidden', 'true')
    }
    expect(container.querySelector('[aria-label="추이 차트 범례"]')).toBeInTheDocument()
  })
})
