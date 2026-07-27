// E2E 계약 스모크(#127) — 실시트 마이그레이션 후 상태와 동일한 시나리오로 GET /api/records
// 전 구간(fetchSheetBundle → buildRecordsResponse → 랭킹/추이/홈 → JSON 직렬화)을 한 번에 돈다.
// 픽스처는 창작하지 않고 docs/prd-event-lifecycle.html §04·§10과 scripts/seed-sheet.mjs의
// SESSION_SCORES를 그대로 옮긴다 — 문서·시딩 스크립트·이 테스트가 같은 숫자를 가리키게 해서
// "실시트 마이그레이션 후 상태"라는 이슈 요구를 문자 그대로 만족시킨다.
//
// functions/api/records.test.ts와의 역할 분담: 그 파일은 캐시·에러 매핑 같은 라우트 관심사를
// 종목 1개짜리 최소 픽스처로 다룬다. 이 파일은 실시트 규모(8종목·2회차·혼재 eventKeys)
// 픽스처로 events[]·eventKeys·rankings·trends·home 전 계약 필드가 라우트 안에서 실제로
// 맞물리는지를 본다 — 랭킹 동점 처리 같은 계산 세부 분기는 compute-rankings.test.ts 등
// 단위 테스트가 이미 촘촘히 덮으므로 여기서는 대표값 위주로만 assert한다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecordsResponse } from '../../shared/domain'
import type { SheetRawBundle } from '../lib/sheetsApi'

const { fetchSheetBundleMock } = vi.hoisted(() => ({ fetchSheetBundleMock: vi.fn() }))

vi.mock('../lib/sheetsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sheetsApi')>()
  return { ...actual, fetchSheetBundle: fetchSheetBundleMock }
})

const { onRequestGet } = await import('./records')

// 목표 탭 8행 — docs/prd-event-lifecycle.html:159-167 §04 예시 그대로. 45도패스캐치가
// 종료 종목(2025-05-16)이고 나머지 7개(패스 3종 + 볼 캐치 포함)가 현역.
const GOALS_ROWS = [
  ['종목', '목표', '만점', '방향', '종료 회차'],
  ['드리블셔틀런', '1:17', '', '낮을수록', ''],
  ['골밑슛', '5', '10', '높을수록', ''],
  ['자유투', '2', '5', '높을수록', ''],
  ['패스 - 체스트', '3', '5', '높을수록', ''],
  ['패스 - 바운드', '3', '5', '높을수록', ''],
  ['패스 - 원핸드', '3', '5', '높을수록', ''],
  ['볼 캐치', '7', '10', '높을수록', ''],
  ['45도패스캐치', '5', '7', '높을수록', '2025-05-16'],
]

const ROSTER_ROWS = [
  ['이름', '상태'],
  ['선수1', '활동'],
  ['선수2', '활동'],
  ['선수3', '활동'],
  ['선수4', '활동'],
  ['선수5', '활동'],
  ['선수6', '활동'],
]

// 2025-05-16 — 과거 회차, 4종목(종료 전 구성), 기록 있음. 45도패스캐치 값은
// scripts/seed-sheet.mjs:44-53 SESSION_SCORES 그대로(선수1~6 순서, 면제 1건 = 선수5).
const OLD_ROUND_ROWS = [
  ['이름', '드리블셔틀런', '골밑슛', '자유투', '45도패스캐치'],
  ['선수1', '1:12', '5', '2', '6'],
  ['선수2', '1:14', '6', '1', '7'],
  ['선수3', '1:10', '7', '3', '7'],
  ['선수4', '1:22', '4', '2', '5'],
  ['선수5', '1:16', '8', '2', '면제'],
  ['선수6', '1:19', '6', '3', '6'],
]

// 2026-07-23 — 신규 회차, 7종목(현역 전체) 헤더 + 참가자 행은 있으나 점수 전부 빈칸
// (docs/prd-event-lifecycle.html:366 §10 진단 그대로 — 아직 아무도 기록을 입력하지 않은 상태).
const NEW_ROUND_ROWS = [
  ['이름', '드리블셔틀런', '골밑슛', '자유투', '패스 - 체스트', '패스 - 바운드', '패스 - 원핸드', '볼 캐치'],
  ['선수1', '', '', '', '', '', '', ''],
  ['선수2', '', '', '', '', '', '', ''],
  ['선수3', '', '', '', '', '', '', ''],
  ['선수4', '', '', '', '', '', '', ''],
  ['선수5', '', '', '', '', '', '', ''],
  ['선수6', '', '', '', '', '', '', ''],
]

function migratedBundle(overrides: Partial<SheetRawBundle> = {}): SheetRawBundle {
  return {
    roster: { name: '버니스명단', values: ROSTER_ROWS },
    goals: { name: '목표', values: GOALS_ROWS },
    rounds: [
      { name: '2025-05-16', date: new Date('2025-05-16'), values: OLD_ROUND_ROWS },
      { name: '2026-07-23', date: new Date('2026-07-23'), values: NEW_ROUND_ROWS },
    ],
    unclassified: [],
    ...overrides,
  }
}

function makeFakeCache() {
  const store = new Map<string, Response>()
  return {
    match: vi.fn(async (request: Request) => {
      const stored = store.get(request.url)
      return stored ? stored.clone() : undefined
    }),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    }),
  }
}

function makeContext(cache: ReturnType<typeof makeFakeCache>) {
  const context = {
    env: { GOOGLE_SERVICE_ACCOUNT_KEY: '{}', SHEET_ID: 'sheet-under-test' },
    waitUntil: () => {},
    // 나머지 PagesFunction context 필드는 이 핸들러가 쓰지 않음
  } as unknown as Parameters<typeof onRequestGet>[0]

  vi.stubGlobal('caches', { default: cache })

  return context
}

async function getRecords<T = RecordsResponse>(bundle: SheetRawBundle): Promise<{ response: Response; body: T }> {
  fetchSheetBundleMock.mockResolvedValue(bundle)
  const context = makeContext(makeFakeCache())
  const response = await onRequestGet(context)
  return { response, body: (await response.clone().json()) as T }
}

interface ErrorBody {
  error: string
  message: string
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchSheetBundleMock.mockReset()
})

describe('GET /api/records — 혼재 번들 계약 스모크 (#127)', () => {
  it('정상 경로: events[]가 목표 탭 순서 8개, 종료 종목이 마지막에 endSessionDate와 함께 온다', async () => {
    const { response, body } = await getRecords(migratedBundle())

    expect(response.status).toBe(200)
    expect(body.events.map((e) => [e.key, e.endSessionDate])).toEqual([
      ['드리블셔틀런', null],
      ['골밑슛', null],
      ['자유투', null],
      ['패스 - 체스트', null],
      ['패스 - 바운드', null],
      ['패스 - 원핸드', null],
      ['볼 캐치', null],
      ['45도패스캐치', '2025-05-16'],
    ])
  })

  it('정상 경로: 회차별 eventKeys가 과거 4종목·신규 7종목으로 각각 좁혀진다', async () => {
    const { body } = await getRecords(migratedBundle())

    expect(body.sessions.map((s) => [s.date, s.eventKeys.length])).toEqual([
      ['2025-05-16', 4],
      ['2026-07-23', 7],
    ])
    expect(body.sessions[1].eventKeys).toEqual([
      '드리블셔틀런',
      '골밑슛',
      '자유투',
      '패스 - 체스트',
      '패스 - 바운드',
      '패스 - 원핸드',
      '볼 캐치',
    ])
  })

  it('정상 경로: 과거 회차 랭킹은 45도패스캐치 면제자(선수5)를 제외하고 나머지 5명을 담는다', async () => {
    const { body } = await getRecords(migratedBundle())

    const oldRanking = body.rankings[0].events.find((e) => e.event === '45도패스캐치')!
    expect(oldRanking.entries.map((e) => e.name)).toEqual(
      expect.arrayContaining(['선수1', '선수2', '선수3', '선수4', '선수6']),
    )
    expect(oldRanking.entries).toHaveLength(5)
    expect(oldRanking.entries.some((e) => e.name === '선수5')).toBe(false)
  })

  it('정상 경로: 신규 회차는 빈 점수라도 7종목 슬롯이 전부 유지되고 각각 entries: []이다', async () => {
    const { body } = await getRecords(migratedBundle())

    const newRankings = body.rankings[1]
    expect(newRankings.sessionDate).toBe('2026-07-23')
    expect(newRankings.events).toHaveLength(7)
    expect(newRankings.events.every((e) => e.entries.length === 0)).toBe(true)
  })

  it('정상 경로: trends는 8종목 전부 존재하고, 신규 전용 종목·면제 기록은 points: []이다', async () => {
    const { body } = await getRecords(migratedBundle())

    const player5 = body.players.find((p) => p.name === '선수5')!
    expect(player5.trends).toHaveLength(8)
    expect(player5.trends.find((t) => t.event === '45도패스캐치')!.points).toEqual([])

    const player1 = body.players.find((p) => p.name === '선수1')!
    const oldOnlyTrend = player1.trends.find((t) => t.event === '드리블셔틀런')!
    expect(oldOnlyTrend.points).toHaveLength(1)
    expect(oldOnlyTrend.points[0]).toMatchObject({ sessionDate: '2025-05-16', value: 72, display: '1:12' })

    const newOnlyTrend = player1.trends.find((t) => t.event === '패스 - 체스트')!
    expect(newOnlyTrend.points).toEqual([])
    expect(player1.personalBests.some((pb) => pb.event === '볼 캐치')).toBe(false)
  })

  it('정상 경로: home은 최신 회차(신규)를 가리키고, 아직 아무도 기록하지 않아 참여 0명·달성률 전부 0이다', async () => {
    const { body } = await getRecords(migratedBundle())

    expect(body.home.latestSession).toEqual({ date: '2026-07-23', participantCount: 0 })
    expect(body.home.achievementRates).toHaveLength(7)
    expect(
      body.home.achievementRates.every((r) => r.achievedCount === 0 && r.eligibleCount === 0 && r.rate === 0),
    ).toBe(true)
  })

  it('V4 위반: 종료된 45도패스캐치 컬럼이 종료 회차를 초과한 신규 회차 헤더에 존재하면 500', async () => {
    const violatingNewRound = [
      [...NEW_ROUND_ROWS[0], '45도패스캐치'],
      ...NEW_ROUND_ROWS.slice(1).map((row) => [...row, '6']),
    ]
    const bundle = migratedBundle({
      rounds: [
        { name: '2025-05-16', date: new Date('2025-05-16'), values: OLD_ROUND_ROWS },
        { name: '2026-07-23', date: new Date('2026-07-23'), values: violatingNewRound },
      ],
    })

    const { response, body } = await getRecords<ErrorBody>(bundle)

    expect(response.status).toBe(500)
    expect(body.error).toBe('sheet_data_invalid')
    expect(body.message).toMatch(/45도패스캐치/)
    expect(body.message).toMatch(/2025-05-16/)
  })

  it('V6 위반: 목표 탭 종료 회차가 실존하지 않는 회차 탭을 가리키면 500', async () => {
    const goalsWithBadEndDate = GOALS_ROWS.map((row) =>
      row[0] === '45도패스캐치' ? [row[0], row[1], row[2], row[3], '2025-05-01'] : row,
    )
    const bundle = migratedBundle({ goals: { name: '목표', values: goalsWithBadEndDate } })

    const { response, body } = await getRecords<ErrorBody>(bundle)

    expect(response.status).toBe(500)
    expect(body.error).toBe('sheet_data_invalid')
    expect(body.message).toMatch(/45도패스캐치/)
    expect(body.message).toMatch(/2025-05-01/)
  })
})
