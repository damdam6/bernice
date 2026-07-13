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

// ── 개별 점수 상태 — 정상 기록 · 면제 · 미측정 ────────────────────────────
export const SCORE_STATUSES = ['recorded', 'exempt', 'unmeasured'] as const
export type ScoreStatus = (typeof SCORE_STATUSES)[number]

/** 선수 — 버니스명단 1행 = 선수 1명.
 *  id는 시트 열이 아니라 행 위치 기반 파생값(1부터, 헤더 제외).
 *  행 순서 = 신원(정렬·삭제 금지, docs/sheet-rules.html §01)이라 재계산해도 항상 안정적. */
export interface Player {
  id: number
  name: string
  status: PlayerStatus
}

/** 종목 정의 — 목표 탭 1행 = 종목 1개. key가 회차 점수 컬럼·랭킹·추이를 잇는 유일한 식별자. */
export interface EventDefinition {
  key: string
  valueKind: EventValueKind
  target: string // 목표치 원본 표시값 ("1:17" | "5")
  targetValue: number // 정규화 목표치(시간=초, 개수=그대로) — 달성 판정 기준
  maxScore: number | null // 만점(표시용 분모). 없으면 null (예: 셔틀런)
  direction: RankDirection
}

/** 회차 1건, 종목 1개의 점수 한 칸. */
export interface EventScore {
  status: ScoreStatus
  value: number | null // 정규화 값. status가 'recorded'가 아니면 null
  display: string | null // 원본 표시값 그대로("1:12" | "6"). status가 'recorded'가 아니면 null
}

/** 회차 1건에서 선수 1명의 기록 행. */
export interface SessionEntry {
  playerId: number
  name: string // 그 시점 이름(참조 수식이라 개명 시 항상 최신과 동일)
  scores: Record<string, EventScore> // key = EventDefinition.key
  participated: boolean // 전 종목 unmeasured면 false (회차 전체 미참여)
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
  rank: number // 1부터. 동점은 공동순위(예: 1,1,3) — 다음 등수는 동점자 수만큼 건너뜀
  achieved: boolean
}

export interface EventRanking {
  event: string // EventDefinition.key
  entries: RankingEntry[] // rank 오름차순. 면제·미측정·활동 외 상태 제외
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
  deltaFromPrevious: number | null // 직전 유효 기록 대비 변화. 첫 기록이면 null
}

export interface PlayerEventTrend {
  event: string
  points: TrendPoint[] // 유효 기록을 남긴 회차만(면제·미측정 제외), 날짜 오름차순
}

export interface PlayerPersonalBest {
  event: string
  value: number
  display: string
  sessionDate: string
  achieved: boolean
}

/** 선수 1명의 프로필 요약(추이·PB 포함). 탈퇴 상태는 응답 어디에도 등장하지 않음. */
export interface PlayerSummary extends Player {
  trends: PlayerEventTrend[]
  personalBests: PlayerPersonalBest[]
}

export interface EventAchievementRate {
  event: string
  achievedCount: number
  eligibleCount: number // 면제·미측정 제외한 분모, 활동 상태만 집계
  rate: number // 0~1
}

export interface HomeSummary {
  latestSession: { date: string; participantCount: number } | null
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
