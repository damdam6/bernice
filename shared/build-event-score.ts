// normalizeScore + EventDefinition.valueKind 교차검증으로 EventScore를 만드는 단일 원천(PRD §08).
// 서버(회차 파서 #27, 쓰기 경로 #64)와 프론트 입력 화면(#68)이 같은 함수로 판정해야 규칙이
// 두 곳으로 갈라지지 않는다 — 그래서 Sheets·행/열 개념에 의존하지 않는 순수 함수만 shared/로 둔다.
import type { EventDefinition, EventScore } from './domain'
import { normalizeScore } from './normalize-score'

export function buildEventScore(cell: string | undefined, event: EventDefinition): EventScore {
  const normalized = normalizeScore(cell ?? null)

  switch (normalized.kind) {
    case 'exempt':
      return { status: 'exempt', value: null, display: null }
    case 'blank':
      return { status: 'unmeasured', value: null, display: null }
    case 'invalid':
      return { status: 'invalid', value: null, display: normalized.raw.trim(), reason: normalized.reason }
    case 'count':
    case 'seconds': {
      const matchesValueKind =
        (normalized.kind === 'count' && event.valueKind === 'count') ||
        (normalized.kind === 'seconds' && event.valueKind === 'time')

      if (!matchesValueKind) {
        return {
          status: 'invalid',
          value: null,
          display: normalized.raw.trim(),
          reason: `종목 형식(${event.valueKind})과 입력 형식(${normalized.kind})이 다릅니다`,
        }
      }

      return { status: 'recorded', value: normalized.value, display: normalized.raw.trim() }
    }
  }
}
