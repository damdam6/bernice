// 오늘(Asia/Seoul) 날짜를 YYYY-MM-DD로 만든다. 회차 탭 이름 규칙(docs/sheet-rules.html §01)과
// sheetTabs.ts의 YYYY-MM-DD 파싱에 정확히 맞물린다.
//
// Workers 런타임 ICU의 타임존 데이터(Intl timeZone: 'Asia/Seoul')에 기대지 않는다 — 대신 KST가
// UTC+9(고정, DST 없음)라는 사실만 써서 UTC 시각을 +9시간 민 뒤 그 결과의 UTC 필드를 읽는다.
// 순수 함수라 호출자가 new Date()를 주입해 자정 경계·월말 넘김을 결정적으로 테스트할 수 있다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function formatSeoulDate(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
