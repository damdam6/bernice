import { describe, expect, it } from 'vitest'
import { polygonPoints, radarLabelLayout, radarPoint, ringPoints } from './radar-math'

const CENTER = 100
const RADIUS = 80

describe('radarPoint', () => {
  it('12시 시작 시계방향 — 4축이면 상/우/하/좌', () => {
    expect(radarPoint(0, 4, 1, CENTER, RADIUS)).toEqual({ x: 100, y: 20 })
    expect(radarPoint(1, 4, 1, CENTER, RADIUS)).toEqual({ x: 180, y: 100 })
    expect(radarPoint(2, 4, 1, CENTER, RADIUS)).toEqual({ x: 100, y: 180 })
    expect(radarPoint(3, 4, 1, CENTER, RADIUS)).toEqual({ x: 20, y: 100 })
  })

  it('값이 반이면 반지름도 반', () => {
    expect(radarPoint(0, 4, 0.5, CENTER, RADIUS)).toEqual({ x: 100, y: 60 })
  })

  it('값 0은 중심점', () => {
    expect(radarPoint(2, 4, 0, CENTER, RADIUS)).toEqual({ x: 100, y: 100 })
  })
})

describe('polygonPoints', () => {
  it('축 순서대로 "x,y" 공백 연결', () => {
    expect(polygonPoints([1, 1, 1, 1], CENTER, RADIUS)).toBe('100,20 180,100 100,180 20,100')
  })
})

describe('ringPoints', () => {
  it('level/ringCount 비율의 정다각형 — 2/4 링은 전값 0.5 폴리곤과 동일', () => {
    expect(ringPoints(2, 4, 4, CENTER, RADIUS)).toBe(polygonPoints([0.5, 0.5, 0.5, 0.5], CENTER, RADIUS))
  })
})

describe('radarLabelLayout', () => {
  it('4축 — 상단은 위로, 우측은 오른쪽으로, 하단은 아래로, 좌측은 왼쪽으로 밀린다', () => {
    expect(radarLabelLayout(0, 4)).toEqual({ anchor: 'middle', baseline: 'auto' })
    expect(radarLabelLayout(1, 4)).toEqual({ anchor: 'start', baseline: 'middle' })
    expect(radarLabelLayout(2, 4)).toEqual({ anchor: 'middle', baseline: 'hanging' })
    expect(radarLabelLayout(3, 4)).toEqual({ anchor: 'end', baseline: 'middle' })
  })
})
