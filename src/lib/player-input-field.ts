// 선수별 입력 화면(#68)의 종목 카드 로컬 폼 상태 — EventDefinition.valueKind가 필드 모양을
// 결정하므로 판별 유니언으로 둔다(시간=분·초 2필드, 개수=숫자 1필드). exempt는 valueKind와
// 무관한 공통 플래그이지만, 토글은 면제 가능 종목에만 노출되므로(exemptable-events.ts) 그 외
// 종목엔 항상 false로 초기화한다 — 그렇지 않으면 시트 직접 편집으로 이미 "면제"가 들어간
// 비면제 종목의 입력부가 토글 없이 숨겨져버려(§02 결정 10의 "UI 노출만 제한"과 모순) 되돌릴
// 방법이 없어진다.
import type { EventDefinition, EventScore } from '../../shared/domain'
import { isExemptable } from './exemptable-events'

export type FieldState =
  | { valueKind: 'time'; minutes: string; seconds: string; exempt: boolean }
  | { valueKind: 'count'; count: string; exempt: boolean }

export interface FieldNotice {
  display: string
  reason: string
}

// 기존 값 프리필. recorded만 값을 복원하고, 그 외(exempt/unmeasured/invalid)는 입력부를 빈
// 상태로 둔다(§05: invalid는 비우고 원본·사유를 별도 안내 — initialFieldNotice가 그 안내를
// 만든다). display는 NFKC로 한 번 더 정규화해 둔다 — 시트 직접 입력 이력에 전각 콜론·전각
// 숫자가 남아 있어도(normalize-score.ts가 원본 raw를 보존하는 필드라 가능) mm/ss 필드에
// 반각으로 보인다.
export function initFieldState(event: EventDefinition, score: EventScore): FieldState {
  const exempt = isExemptable(event.key) && score.status === 'exempt'
  const recordedDisplay = score.status === 'recorded' ? score.display.normalize('NFKC') : ''

  if (event.valueKind === 'time') {
    if (recordedDisplay === '') return { valueKind: 'time', minutes: '', seconds: '', exempt }
    const [minutes, seconds] = recordedDisplay.split(':')
    return { valueKind: 'time', minutes, seconds, exempt }
  }

  return { valueKind: 'count', count: recordedDisplay, exempt }
}

// invalid 프리필뿐 아니라, 면제 가능하지 않은 종목에 이미 "면제"가 저장돼 있는 경우(시트 직접
// 편집 유래)도 같은 방식으로 안내한다 — 두 경우 다 이 화면의 입력부가 값을 있는 그대로
// 표현하지 못해 필드를 비워야 하는 상황이라, 왜 비어 있는지 원본과 함께 알려준다.
export function initialFieldNotice(event: EventDefinition, score: EventScore): FieldNotice | null {
  if (score.status === 'invalid') return { display: score.display, reason: score.reason }
  if (score.status === 'exempt' && !isExemptable(event.key)) {
    return { display: '면제', reason: '이 종목은 면제 토글이 없어요 — 값을 입력하거나, 빈 채로 저장하면 미측정으로 바뀝니다' }
  }
  return null
}

// 서버 전송용 원본 문자열 조립 — buildEventScore(shared/)에 그대로 통과시켜 인라인 검증·저장
// payload 양쪽에 쓴다. 시간 필드는 분·초가 둘 다 빈칸일 때만 미측정(빈 문자열)으로 본다 —
// 하나만 채워지면 "5:" 같은 불완전한 문자열이 되고, 이는 normalizeScore가 그대로 invalid로
// 판정해준다(별도 규칙을 새로 만들지 않음).
export function buildFieldRaw(field: FieldState): string {
  if (field.exempt) return '면제'
  if (field.valueKind === 'time') {
    if (field.minutes === '' && field.seconds === '') return ''
    return `${field.minutes}:${field.seconds}`
  }
  return field.count
}
