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

  // #125 — radar-math는 N축 일반이므로 4각형뿐 아니라 7각형(회차별 측정 종목 7개) 좌표도
  // axisAngle(i, 7) = 2π·i/7 - π/2 공식대로 정확히 계산되는지 확인한다.
  it('7축 — 12시에서 시작해 2π/7 간격으로 시계방향 배치', () => {
    expect(radarPoint(0, 7, 1, CENTER, RADIUS)).toEqual({ x: 100, y: 20 })
    expect(radarPoint(1, 7, 1, CENTER, RADIUS)).toEqual({ x: 162.55, y: 50.12 })
    expect(radarPoint(2, 7, 1, CENTER, RADIUS)).toEqual({ x: 177.99, y: 117.8 })
    expect(radarPoint(3, 7, 1, CENTER, RADIUS)).toEqual({ x: 134.71, y: 172.08 })
    expect(radarPoint(4, 7, 1, CENTER, RADIUS)).toEqual({ x: 65.29, y: 172.08 })
    expect(radarPoint(5, 7, 1, CENTER, RADIUS)).toEqual({ x: 22.01, y: 117.8 })
    expect(radarPoint(6, 7, 1, CENTER, RADIUS)).toEqual({ x: 37.45, y: 50.12 })
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

  // #125 — 90도 간격이 아닌 7축에서도 cos/sin 부호로 anchor/baseline이 방향에 맞게 갈리는지 확인.
  it('7축 — 축 각도에 따라 좌/우/상/하 방향으로 라벨이 밀린다', () => {
    expect(radarLabelLayout(0, 7)).toEqual({ anchor: 'middle', baseline: 'auto' })
    expect(radarLabelLayout(1, 7)).toEqual({ anchor: 'start', baseline: 'auto' })
    expect(radarLabelLayout(2, 7)).toEqual({ anchor: 'start', baseline: 'hanging' })
    expect(radarLabelLayout(3, 7)).toEqual({ anchor: 'start', baseline: 'hanging' })
    expect(radarLabelLayout(4, 7)).toEqual({ anchor: 'end', baseline: 'hanging' })
    expect(radarLabelLayout(5, 7)).toEqual({ anchor: 'end', baseline: 'hanging' })
    expect(radarLabelLayout(6, 7)).toEqual({ anchor: 'end', baseline: 'auto' })
  })
})
