// 레이더 차트 좌표 계산 — DOM 없이 단위 테스트하기 위해 렌더링과 분리한 순수 함수.
// 축은 12시 방향에서 시작해 시계방향으로 배치한다(SVG 좌표계 — y가 아래로 증가).

export interface RadarPoint {
  x: number
  y: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function axisAngle(axisIndex: number, axisCount: number): number {
  return (Math.PI * 2 * axisIndex) / axisCount - Math.PI / 2
}

/** 축 위의 값(0~1, 라벨 배치용으론 1 초과도 허용) → SVG 좌표. */
export function radarPoint(
  axisIndex: number,
  axisCount: number,
  value: number,
  center: number,
  radius: number,
): RadarPoint {
  const angle = axisAngle(axisIndex, axisCount)
  return {
    x: round2(center + Math.cos(angle) * radius * value),
    y: round2(center + Math.sin(angle) * radius * value),
  }
}

/** 값 배열(축 순서) → SVG polygon points 문자열. */
export function polygonPoints(values: number[], center: number, radius: number): string {
  return values
    .map((value, i) => {
      const point = radarPoint(i, values.length, value, center, radius)
      return `${point.x},${point.y}`
    })
    .join(' ')
}

/** level/ringCount 비율의 배경 링(정다각형) points 문자열. */
export function ringPoints(
  level: number,
  ringCount: number,
  axisCount: number,
  center: number,
  radius: number,
): string {
  return polygonPoints(new Array<number>(axisCount).fill(level / ringCount), center, radius)
}

export interface RadarLabelLayout {
  anchor: 'start' | 'middle' | 'end'
  baseline: 'auto' | 'middle' | 'hanging'
}

/** 축 방향에 따라 라벨이 차트 바깥쪽으로 밀려나도록 anchor/baseline을 정한다. */
export function radarLabelLayout(axisIndex: number, axisCount: number): RadarLabelLayout {
  const angle = axisAngle(axisIndex, axisCount)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    anchor: Math.abs(cos) < 0.1 ? 'middle' : cos > 0 ? 'start' : 'end',
    baseline: Math.abs(sin) < 0.1 ? 'middle' : sin > 0 ? 'hanging' : 'auto',
  }
}
