// 버니스 실력 기록 — 공용 도메인 타입. 파서·계산(functions)과 프론트(src)가 함께 import.
// 근거: docs/sheet-integration.html(시트 스키마) · docs/sheet-rules.html(운영 규칙) · docs/records-schema.html(이 타입의 JSON 계약 문서)

// ── 선수 상태 — 버니스명단 상태 드롭다운 4종 (scripts/seed-sheet.mjs와 동일해야 함) ──
export const PLAYER_STATUSES = ['활동', '탈퇴', '비대상', '휴식'] as const
export type PlayerStatus = (typeof PLAYER_STATUSES)[number]

// ── 종목 정렬 방향 — 목표 탭 방향 드롭다운 ──────────────────────────────
export const RANK_DIRECTIONS = ['낮을수록', '높을수록'] as const
export type RankDirection = (typeof RANK_DIRECTIONS)[number]

// ── 점수 값 형식 — 셀 표기로 파서가 판별(콜론 포함 = 시간) ────────────────
export const EVENT_VALUE_KINDS = ['count', 'time'] as const
export type EventValueKind = (typeof EVENT_VALUE_KINDS)[number]

// ── 개별 점수 상태 — 정상 기록 · 면제 · 미측정 · 이상값 ───────────────────
// functions/lib/normalize-score.ts(이슈 #6)의 ScoreValue.kind → 이 상태로 매핑:
//   count/seconds → recorded · exempt → exempt · blank → unmeasured · invalid → invalid
// EventDefinition.valueKind(종목 기준)와 정규화된 kind(셀 기준)가 어긋나면(예: 개수 종목 셀에
// "1:15" 입력) invalid로 처리 — 상세 규칙은 docs/records-schema.html §03 참고.
export const SCORE_STATUSES = ['recorded', 'exempt', 'unmeasured', 'invalid'] as const
export type ScoreStatus = (typeof SCORE_STATUSES)[number]

/** 선수 — 버니스명단 1행 = 선수 1명.
 *  id는 시트 열이 아니라 행 위치 기반 파생값(1부터, 헤더 제외).
 *  행 순서 = 신원(정렬·삭제 금지, docs/sheet-rules.html §01)이라 재계산해도 항상 안정적. */
export interface Player {
  id: number
  name: string
  status: PlayerStatus
}

/** 종목 정의 — 목표 탭 1행 = 종목 1개. key가 회차 점수 컬럼·랭킹·추이를 잇는 유일한 식별자.
 *  달성 판정은 direction 기준 경계값 포함(같아도 달성) — 낮을수록는 value <= targetValue,
 *  높을수록는 value >= targetValue. */
export interface EventDefinition {
  key: string
  valueKind: EventValueKind
  target: string // 목표치 원본 표시값 ("1:17" | "5")
  targetValue: number // 정규화 목표치(시간=초, 개수=그대로) — 달성 판정 기준
  maxScore: number | null // 만점(표시용 분모). 없으면 null (예: 셔틀런)
  direction: RankDirection
}

/** 회차 1건, 종목 1개의 점수 한 칸 — status로 분기하면 value/display를 null 체크 없이 쓸 수 있다.
 *  invalid는 이상값이 실제로 입력된 경우(예: "1:75", 음수, 소수)로, display에 원본을 그대로 보존하고
 *  reason에 사람이 읽을 사유를 담는다 — 값이 없는 unmeasured(빈칸)와는 구분됨. */
export type EventScore =
  | { status: 'recorded'; value: number; display: string }
  | { status: 'exempt' | 'unmeasured'; value: null; display: null }
  | { status: 'invalid'; value: null; display: string; reason: string }

/** 회차 1건에서 선수 1명의 기록 행. */
export interface SessionEntry {
  playerId: number
  name: string // 그 시점 이름(참조 수식이라 개명 시 항상 최신과 동일)
  scores: Record<string, EventScore> // key = EventDefinition.key. events[] 전체 key가 항상 존재(누락 없음) —
  // participated 파생과 프론트 인덱싱이 이 완전성 전제에 의존한다.
  participated: boolean // 전 종목이 unmeasured면 false. exempt·invalid는 "무언가 입력됨"으로 간주해 참여로 침
}

/** 회차 1개 = 날짜 탭 1개. */
export interface Session {
  date: string // YYYY-MM-DD, 탭 이름 원본
  entries: SessionEntry[] // 그 회차 탭에 실제로 존재하는 명단 행만
  // (이후 가입자는 과거 회차에 엔트리 자체가 없음)
}

/** 종목별 랭킹 1행. */
export interface RankingEntry {
  playerId: number
  name: string
  value: number
  display: string
  rank: number // 1부터. 동점(정규화 value 기준, display 문자열 기준 아님)은 공동순위(예: 1,1,3) —
  // 건너뛰기는 이 배열에 포함된 엔트리(활동 상태 + recorded)만 대상으로 계산
  achieved: boolean
}

export interface EventRanking {
  event: string // EventDefinition.key
  entries: RankingEntry[] // rank 오름차순. 면제·미측정·이상값·활동 외 상태 제외
}

/** 회차 1개에 대한 종목별 랭킹 묶음 — 랭킹 화면의 "회차 선택 → 종목 탭" 흐름과 그대로 대응. */
export interface SessionRankings {
  sessionDate: string
  events: EventRanking[]
}

/** 개인 추이 — 종목 1개의 회차별 기록 흐름. */
export interface TrendPoint {
  sessionDate: string
  value: number
  display: string
  achieved: boolean
  deltaFromPrevious: number | null // 직전 유효 기록 대비 원값 변화(시간=초, 개수=그대로). 첫 기록이면 null
  improved: boolean | null // direction까지 반영한 개선 여부(낮을수록 종목은 delta<0이 개선, 동률(delta===0)은 개선 아님). 첫 기록이면 null
}

export interface PlayerEventTrend {
  event: string
  points: TrendPoint[] // 유효 기록을 남긴 회차만(면제·미측정·이상값 제외), 날짜 오름차순
}

/** 개인 최고기록 — direction 기준 최고값 1건(이슈 #29). 여러 회차가 동률이면
 *  sessionDate는 그 값을 처음 달성한(가장 이른) 회차 — 타이 기록은 PB를 새로 세우는 게 아니라 유지하는 것으로 본다. */
export interface PlayerPersonalBest {
  event: string
  value: number
  display: string
  sessionDate: string
  achieved: boolean
}

/** 선수 1명의 프로필 요약(추이·PB 포함). status가 '탈퇴'를 제외한 타입이라 탈퇴 선수는
 *  응답에 아예 나타날 수 없음이 타입 수준에서 강제된다(활동 외 상태의 랭킹 제외는 응답 구성 규칙으로 별도 처리). */
export interface PlayerSummary extends Player {
  status: Exclude<PlayerStatus, '탈퇴'>
  trends: PlayerEventTrend[] // events[] 전체에 대해 항상 하나씩 존재(기록이 전혀 없으면 points: [])
  personalBests: PlayerPersonalBest[] // 유효 기록이 1건이라도 있는 종목만 포함(스파스 — 미기록 종목은 항목 자체가 없음)
}

export interface EventAchievementRate {
  event: string
  achievedCount: number
  eligibleCount: number // 면제·미측정·이상값 제외한 분모, 활동 상태만 집계
  rate: number // 0~1. eligibleCount가 0이면(예: 그 회차 전원 면제) 0
}

export interface HomeSummary {
  latestSession: {
    date: string
    participantCount: number // 활동 상태 선수 중 participated=true인 인원만 집계(비대상·휴식 제외)
  } | null
  achievementRates: EventAchievementRate[]
}

/** GET /api/records 최종 응답. */
export interface RecordsResponse {
  generatedAt: string // ISO — 캐시 확인용
  events: EventDefinition[] // 목표 탭 행 순서
  players: PlayerSummary[] // 활동·비대상·휴식만(탈퇴 제외). 버니스명단 행 순서
  sessions: Session[] // 날짜 오름차순
  rankings: SessionRankings[] // 날짜 오름차순, 활동 상태만 집계 대상
  home: HomeSummary
}
