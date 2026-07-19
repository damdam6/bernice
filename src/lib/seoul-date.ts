// 오늘(Asia/Seoul) 날짜를 YYYY-MM-DD로 만든다. functions/lib/seoul-date.ts와 동일 로직의
// 프론트 사본 — tsconfig.app.json이 functions/를 include하지 않아 직접 import할 수 없다(#67).
// 회차 탭 이름 규칙과 정확히 맞물려야 하므로(기록지 만들기 화면 헤더 "오늘 · YYYY-MM-DD"),
// 백엔드와 같은 KST=UTC+9 고정 오프셋 방식을 그대로 쓴다(Intl 타임존 데이터에 기대지 않음).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function formatSeoulDate(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
