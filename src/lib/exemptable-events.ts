// 면제 가능 종목 — 입력 화면(#68)의 면제 토글은 이 목록에 있는 종목에만 노출한다.
// 서버·파서는 기존대로 모든 종목의 "면제" 리터럴을 수용한다(시트 직접 편집 escape hatch와
// 의미론 동일) — 여기서 제한하는 건 UI 노출뿐. 디자인 PRD §09 열린 항목 권장대로 목표 탭
// 스키마 변경 없이 프론트 상수로 시작한다. 45도패스캐치(종료 종목, docs/prd-event-lifecycle.html
// §09·§10)의 후속인 패스 3종으로 교체(이슈 #126) — 종료 종목은 신규 입력 대상이 아니다.
const EXEMPTABLE_EVENT_KEYS = new Set(['패스 - 체스트', '패스 - 바운드', '패스 - 원핸드'])

export function isExemptable(eventKey: string): boolean {
  return EXEMPTABLE_EVENT_KEYS.has(eventKey.normalize('NFC'))
}
