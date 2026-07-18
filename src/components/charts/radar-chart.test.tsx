// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RadarChart } from './radar-chart'

afterEach(cleanup)

const AXES = [
  { label: '셔틀런', value: 1 },
  { label: '골밑슛', value: 0.5 },
  { label: '자유투', value: 0.25 },
  { label: '패스캐치', value: 0 },
]

describe('RadarChart', () => {
  it('링 4개 + 채움 폴리곤 1개 (§07)', () => {
    const { container } = render(<RadarChart axes={AXES} />)
    const polygons = container.querySelectorAll('polygon')
    expect(polygons).toHaveLength(5)
    expect(container.querySelectorAll('polygon[fill="none"]')).toHaveLength(4)
  })

  it('채움 폴리곤은 primary 14% 투명', () => {
    const { container } = render(<RadarChart axes={AXES} />)
    const filled = container.querySelector('polygon[fill-opacity]')
    expect(filled).toHaveAttribute('fill-opacity', '0.14')
    expect(filled?.getAttribute('class')).toContain('fill-primary')
    expect(filled?.getAttribute('class')).toContain('stroke-primary')
  })

  it('꼭짓점 도트는 축 수만큼 primary로', () => {
    const { container } = render(<RadarChart axes={AXES} />)
    const dots = container.querySelectorAll('circle')
    expect(dots).toHaveLength(4)
    expect(dots[0].getAttribute('class')).toContain('fill-primary')
  })

  it('축 라벨 텍스트 렌더', () => {
    const { container } = render(<RadarChart axes={AXES} />)
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(labels).toEqual(['셔틀런', '골밑슛', '자유투', '패스캐치'])
  })

  it('접근성 — 정규화 값을 %로 읽어준다', () => {
    const { container } = render(<RadarChart axes={AXES} />)
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-label',
      '종목 프로필 레이더 — 셔틀런 100%, 골밑슛 50%, 자유투 25%, 패스캐치 0%',
    )
  })

  it('범위 밖 값은 클램프해 렌더', () => {
    const { container } = render(
      <RadarChart axes={[{ label: 'a', value: 1.5 }, { label: 'b', value: -1 }, { label: 'c', value: 0.5 }]} />,
    )
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      '종목 프로필 레이더 — a 100%, b 0%, c 50%',
    )
  })

  it('축이 없으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<RadarChart axes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
