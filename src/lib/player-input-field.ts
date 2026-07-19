// 선수별 입력 화면(#68)의 종목 카드 로컬 폼 상태 — EventDefinition.valueKind가 필드 모양을
// 결정하므로 판별 유니언으로 둔다(시간=분·초 2필드, 개수=숫자 1필드). exempt는 valueKind와
// 무관한 공통 플래그 — 서버가 모든 종목의 "면제"를 수용하는 것과 같은 의미론이고, 노출 여부만
// exemptable-events.ts가 화면에서 제한한다.
import type { EventDefinition, EventScore } from '../../shared/domain'

export type FieldState =
  | { valueKind: 'time'; minutes: string; seconds: string; exempt: boolean }
  | { valueKind: 'count'; count: string; exempt: boolean }

export interface InvalidNotice {
  display: string
  reason: string
}

// 기존 값 프리필. recorded만 값을 복원하고, exempt/unmeasured/invalid는 입력부를 빈 상태로 둔다
// (§05: invalid는 비우고 원본·사유를 별도 안내 — initialInvalidNotice가 그 안내를 만든다).
// display는 NFKC로 한 번 더 정규화해 둔다 — 시트 직접 입력 이력에 전각 콜론·전각 숫자가 남아
// 있어도(normalize-score.ts가 원본 raw를 보존하는 필드라 가능) mm/ss 필드에 반각으로 보인다.
export function initFieldState(event: EventDefinition, score: EventScore): FieldState {
  const exempt = score.status === 'exempt'
  const recordedDisplay = score.status === 'recorded' ? score.display.normalize('NFKC') : ''

  if (event.valueKind === 'time') {
    if (recordedDisplay === '') return { valueKind: 'time', minutes: '', seconds: '', exempt }
    const [minutes, seconds] = recordedDisplay.split(':')
    return { valueKind: 'time', minutes, seconds, exempt }
  }

  return { valueKind: 'count', count: recordedDisplay, exempt }
}

export function initialInvalidNotice(score: EventScore): InvalidNotice | null {
  if (score.status !== 'invalid') return null
  return { display: score.display, reason: score.reason }
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
