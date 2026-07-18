// 정규화 성능 함수 — 디자인 PRD §07 열린 항목의 확정안 (이슈 #69).
// 레이더·종목 추이·랭킹 미니바가 같은 scale 인스턴스를 공유해 세 차트의 값이 정의상 일치한다.
//
// 규칙:
//   개수 종목(만점 있음 + 높을수록): value / maxScore
//   그 외(시간 종목 · 만점 없는 종목 · 낮을수록 개수): 전 회차·전 선수 recorded 값의
//     min~max 범위 스케일 — 낮을수록는 반전해 어느 종목이든 1 = 좋음, 0 = 나쁨
//   반환은 항상 0~1 클램프. 관측값이 없거나 전원 동률(min == max)이면 0.5 중립.
//
// 목표선도 같은 함수로 정규화한다 — 목표가 관측 범위 밖이면 0/1로 클램프되어 차트
// 가장자리에 붙는다(전원 미달/전원 초과의 자연스러운 표현). 범위 스케일 종목은 새 기록이
// min/max를 갱신하면 과거 점의 y값도 함께 움직인다 — 절대 성능이 아니라 팀 내 상대
// 성능 표현이다(§07).
import type { EventDefinition, Session } from '../../shared/domain'

export interface PerformanceScale {
  /** 원값(시간=초, 개수=그대로) → 0~1 정규화 성능. 모르는 종목·비정상 값은 0.5 중립. */
  normalize(eventKey: string, value: number): number
}

/** 정규화 성능이 범위를 살짝 벗어나도(상류 계산 오차 등) 차트가 깨지지 않게 0~1로 클램프. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

const NEUTRAL = 0.5

interface ValueRange {
  min: number
  max: number
}

export function buildPerformanceScale(
  events: EventDefinition[],
  sessions: Session[],
): PerformanceScale {
  const definitions = new Map(events.map((event) => [event.key, event]))

  // 종목별 관측 범위 — 전 회차·전 선수의 recorded 값만 집계(면제·미측정·이상값 제외)
  const ranges = new Map<string, ValueRange>()
  for (const session of sessions) {
    for (const entry of session.entries) {
      for (const [key, score] of Object.entries(entry.scores)) {
        if (score.status !== 'recorded') continue
        const range = ranges.get(key)
        if (!range) {
          ranges.set(key, { min: score.value, max: score.value })
        } else {
          range.min = Math.min(range.min, score.value)
          range.max = Math.max(range.max, score.value)
        }
      }
    }
  }

  return {
    normalize(eventKey, value) {
      const event = definitions.get(eventKey)
      if (!event || !Number.isFinite(value)) return NEUTRAL

      // 만점 규칙은 "높을수록"일 때만 의미가 있다(낮을수록면 value/maxScore가 의미 역전) —
      // maxScore 0 이하도 방어적으로 범위 스케일로 폴백
      if (
        event.valueKind === 'count' &&
        event.maxScore !== null &&
        event.maxScore > 0 &&
        event.direction === '높을수록'
      ) {
        return clamp01(value / event.maxScore)
      }

      const range = ranges.get(eventKey)
      if (!range || range.min === range.max) return NEUTRAL
      const ratio = (value - range.min) / (range.max - range.min)
      return clamp01(event.direction === '낮을수록' ? 1 - ratio : ratio)
    },
  }
}
