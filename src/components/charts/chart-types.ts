// 라인·레이더 두 프리셋이 공유하는 계열(series) 타입 — 특정 프리셋에 종속되지 않도록 별도 파일로 분리.
export interface ChartSeries {
  key: string
  label: string
  color?: string
}
