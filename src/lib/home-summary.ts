// 홈 요약 파생 로직(#103) — RecordsResponse.home + events/sessions에서 화면이 그릴 값만
// 순수 함수로 뽑아낸다. 렌더(Home.tsx)와 분리해 파생 규칙을 단위 테스트로 못박는다.
// 정본: docs/prd-design.html §05 🏠 홈 표(요소→필드 매핑).
import type { EventAchievementRate, EventDefinition, Session } from '../../shared/domain'

/** 최신 회차의 n차 라벨 번호 — sessions(날짜 오름차순)에서 date의 위치+1.
 *  Rankings의 `{i + 1}차` 규칙과 동일 출처를 쓴다. 못 찾으면 0(방어값 —
 *  latestSession=null 빈 상태를 호출부가 이미 걸러 실제로는 도달하지 않는다). */
export function latestSessionOrdinal(sessions: Session[], date: string): number {
  const index = sessions.findIndex((session) => session.date === date)
  return index === -1 ? 0 : index + 1
}

/** 평균 목표 달성% — achievementRates[].rate 단순 평균 ×100 반올림. 빈 배열이면 0.
 *  rate가 곧 achievedCount/eligibleCount(0 가드 포함, domain.ts)라 목업의
 *  count/total 평균 계산과 동치다. */
export function averageAchievementPct(rates: EventAchievementRate[]): number {
  if (rates.length === 0) return 0
  const sum = rates.reduce((acc, rate) => acc + rate.rate, 0)
  return Math.round((sum / rates.length) * 100)
}

/** 홈 게이지 1행 — 종목 라벨 + 달성 카운트 + rate(0~1, AchievementGauge value). */
export interface HomeGauge {
  event: string
  label: string
  achievedCount: number
  eligibleCount: number
  rate: number
}

/** 게이지 목록 — achievementRates[] 순서대로, 라벨은 events[]에서 key로 조회한다
 *  (EventDefinition은 key가 곧 표시 라벨). 매칭 종목이 없으면 event key를 그대로 쓴다. */
export function buildHomeGauges(rates: EventAchievementRate[], events: EventDefinition[]): HomeGauge[] {
  return rates.map((rate) => ({
    event: rate.event,
    label: events.find((event) => event.key === rate.event)?.key ?? rate.event,
    achievedCount: rate.achievedCount,
    eligibleCount: rate.eligibleCount,
    rate: rate.rate,
  }))
}
