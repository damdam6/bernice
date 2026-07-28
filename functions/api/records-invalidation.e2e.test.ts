// E2E 최신성 회귀망(#165) — 관리자 쓰기 3종이 응답을 돌려준 "바로 그 순간" 같은 캐시를 공유하는
// GET /api/records가 이미 새 데이터를 반환하는지를 고정한다.
//
// 기존 파일들과의 역할 분담:
//   - records.e2e.test.ts       : GET 한 방향의 계약 스모크(events·rankings·trends·home)
//   - admin/*.test.ts           : 쓰기 핸들러별 계약 + "cache.delete가 불렸다"까지
//   - 이 파일                    : 쓰기 핸들러와 GET 핸들러가 같은 시트·같은 캐시를 공유하는 통합
//
// 무효화 "호출"이 아니라 무효화가 실제로 다음 조회의 "데이터"를 바꾸는지를 보는 것이 요점이다 —
// #161(create-sheet의 purge가 waitUntil에 실려 있던 회귀)은 delete 호출 자체는 있었기 때문에
// 단위 테스트를 그대로 통과했다.
//
// 이 회귀망이 물게 만드는 세 장치:
//   ① 가변 fake 시트  — 읽기 목과 쓰기 목이 같은 스토어를 보므로 쓰기가 다음 읽기에 실제로 보인다.
//   ② 지연 waitUntil — no-op도 즉시 await도 아닌 큐. 쓰기 응답과 후속 GET 사이에 flush하지 않으므로,
//      purge가 waitUntil로 되돌아가면 옛 캐시가 그대로 히트해 시나리오가 빨간불이 된다.
//   ③ no-store put 거부 — 실제 Workers Cache API처럼 fake도 no-store 응답 저장을 거부한다.
//      records.ts가 clone/no-store 순서를 뒤집으면(#162 회귀) 엣지 캐시가 통째로 죽고 히트 경로가 사라진다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordsResponse } from '../../shared/domain'
import type { SheetMeta, SheetRawBundle, ValueRange } from '../lib/sheetsApi'
import { classifySheetTabs } from '../lib/sheetTabs'
import { RECORDS_CACHE_KEY, RECORDS_CACHE_TTL_SECONDS } from '../lib/records-cache'

// I/O 경계만 목킹하고 파서·조립·계획 수립(classify·parse·build)은 실물을 쓴다 —
// admin/create-sheet.test.ts·add-players.test.ts와 같은 관용구.
// fetchSheetBundle은 같은 모듈 안에서 getSpreadsheetTabTitles/batchGetValues를 로컬 바인딩으로
// 부르기 때문에 그 둘만 목킹해도 가로채이지 않는다 → 번들 조립 목도 함께 세운다(fakeSheet.bundle).
const { fetchSheetBundleMock, getSheetsMock, getTabTitlesMock, batchGetMock } = vi.hoisted(() => ({
  fetchSheetBundleMock: vi.fn(),
  getSheetsMock: vi.fn(),
  getTabTitlesMock: vi.fn(),
  batchGetMock: vi.fn(),
}))
vi.mock('../lib/sheetsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sheetsApi')>()
  return {
    ...actual,
    fetchSheetBundle: fetchSheetBundleMock,
    getSpreadsheetSheets: getSheetsMock,
    getSpreadsheetTabTitles: getTabTitlesMock,
    batchGetValues: batchGetMock,
  }
})

const { updateValuesMock, batchUpdateMock } = vi.hoisted(() => ({
  updateValuesMock: vi.fn(),
  batchUpdateMock: vi.fn(),
}))
vi.mock('../lib/sheetsWriteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sheetsWriteApi')>()
  return { ...actual, updateValues: updateValuesMock, batchUpdate: batchUpdateMock }
})

const { onRequestGet } = await import('./records')
const { onRequestPost: postAdminRecords } = await import('./admin/records')
const { onRequestPost: postCreateSheet } = await import('./admin/create-sheet')
const { onRequestPost: postAddPlayers } = await import('./admin/add-players')

// ── 픽스처 ────────────────────────────────────────────────────────────────
// 이 파일은 전 계약이 아니라 "최신성"을 보므로 records.e2e.test.ts의 8종목 실시트 픽스처를
// 복제하지 않고 최소 구성(명단 4명·목표 3종목·회차 1개)만 세운다. 대신 실제 시트와 같이
// 회차 탭 A열은 명단 참조 수식이라, 읽기 경로의 수식 해석까지 기존 행에서도 실행된다.
const ROSTER_TAB = '버니스명단'
const GOALS_TAB = '목표'
const OLD_ROUND = '2025-05-16'
const NEW_ROUND = '2026-07-23' // 시나리오 B에서 create-sheet가 만들 오늘(KST) 탭

const ROSTER_ROWS = [
  ['이름', '상태'],
  ['가은', '활동'], // id 1
  ['나래', '활동'], // id 2
  ['다현', '활동'], // id 3
  ['라온', '활동'], // id 4 — 회차 탭에는 없다(시나리오 C의 추가 대상)
]

const GOALS_ROWS = [
  ['종목', '목표', '만점', '방향', '종료 회차', '면제 가능'],
  ['드리블셔틀런', '1:17', '', '낮을수록', '', ''],
  ['골밑슛', '5', '10', '높을수록', '', '가능'],
  ['자유투', '2', '5', '높을수록', '', ''],
]

const OLD_ROUND_ROWS = [
  ['이름', '드리블셔틀런', '골밑슛', '자유투'],
  [`='${ROSTER_TAB}'!A2`, '1:12', '5', '2'], // 가은
  [`='${ROSTER_TAB}'!A3`, '1:14', '6', '1'], // 나래
  [`='${ROSTER_TAB}'!A4`, '1:10', '7', '3'], // 다현
]

const ENV = { GOOGLE_SERVICE_ACCOUNT_KEY: '{}', SHEET_ID: 'sheet-under-test' }

// ── 가변 fake 시트 ────────────────────────────────────────────────────────
interface FakeTab {
  sheetId: number
  values: string[][]
}

// 단일 셀 참조 수식(='탭'!A7 / =탭!A7)만 해석한다 — 실제 시트가 쓰는 형태가 명단 이름 참조와
// 목표 종목명 참조 둘뿐이기 때문(create-sheet.ts·add-players.ts·scripts/seed-sheet.mjs).
// 그 외 수식은 리터럴로 남겨 조용한 오작동 대신 파서 쪽에서 시끄럽게 실패하게 둔다.
const CELL_REF_RE = /^=(?:'((?:[^']|'')+)'|([^'!]+))!([A-Z]+)(\d+)$/
// updateValues가 넘기는 A1 범위 — 항상 탭 이름 + 시작:끝 셀 형태다.
const RANGE_RE = /^(?:'((?:[^']|'')+)'|([^'!]+))!([A-Z]+)(\d+):([A-Z]+)(\d+)$/

function unquoteTabName(quoted: string | undefined, bare: string | undefined): string {
  return quoted !== undefined ? quoted.replace(/''/g, "'") : (bare ?? '')
}

function columnIndexOf(letters: string): number {
  return [...letters].reduce((index, letter) => index * 26 + (letter.charCodeAt(0) - 64), 0) - 1
}

function makeFakeSheet(initial: { title: string; sheetId: number; values: string[][] }[]) {
  // 삽입 순서 = 시트 탭 순서. 값은 픽스처 상수를 공유하지 않도록 깊은 복사해 담는다.
  const tabs = new Map<string, FakeTab>(
    initial.map(({ title, sheetId, values }) => [title, { sheetId, values: values.map((row) => [...row]) }]),
  )

  function requireTab(title: string): FakeTab {
    const tab = tabs.get(title)
    if (!tab) throw new Error(`fake 시트에 없는 탭입니다: ${title}`)
    return tab
  }

  // FORMATTED_VALUE 읽기 재현 — 저장된 수식을 평가된 값으로 바꿔 돌려준다. 참조가 다시 수식을
  // 가리키는 경우까지 몇 단계만 따라가고, 순환이면 그 자리에서 멈춘다(무한 루프 방지).
  function evaluate(raw: string): string {
    let value = raw
    for (let hop = 0; hop < 5; hop++) {
      const match = CELL_REF_RE.exec(value)
      if (!match) return value
      const target = tabs.get(unquoteTabName(match[1], match[2]))
      if (!target) return value
      value = target.values[Number(match[4]) - 1]?.[columnIndexOf(match[3])] ?? ''
    }
    return value
  }

  function read(title: string): string[][] {
    return requireTab(title).values.map((row) => row.map((cell) => evaluate(cell ?? '')))
  }

  function setCell(tab: FakeTab, rowIndex: number, columnIndex: number, value: string): void {
    while (tab.values.length <= rowIndex) tab.values.push([])
    const row = tab.values[rowIndex]
    while (row.length <= columnIndex) row.push('')
    row[columnIndex] = value
  }

  return {
    titles(): string[] {
      return [...tabs.keys()]
    },
    metas(): SheetMeta[] {
      return [...tabs.entries()].map(([title, tab]) => ({ title, sheetId: tab.sheetId }))
    },
    /** 저장된 원본(수식 그대로) — 쓰기가 수식으로 들어갔는지 검사할 때 쓴다 */
    rawValues(title: string): string[][] {
      return requireTab(title).values.map((row) => [...row])
    },
    read,
    /** sheetsApi.batchGetValues 재현 — 요청 순서 = 반환 순서 */
    batchGet(ranges: string[]): ValueRange[] {
      return ranges.map((range) => {
        const match = /^(?:'((?:[^']|'')+)'|([^'!]+))$/.exec(range)
        if (!match) throw new Error(`fake 시트가 지원하지 않는 batchGet 범위입니다: ${range}`)
        return { range, values: read(unquoteTabName(match[1], match[2])) }
      })
    },
    /** sheetsApi.fetchSheetBundle 재현 — 분류 규칙은 실물 classifySheetTabs를 그대로 재사용한다 */
    bundle(): SheetRawBundle {
      const classification = classifySheetTabs(this.titles())
      return {
        roster: classification.roster === null ? null : { name: classification.roster, values: read(classification.roster) },
        goals: classification.goals === null ? null : { name: classification.goals, values: read(classification.goals) },
        rounds: classification.rounds.map((round) => ({
          name: round.name,
          date: round.date,
          values: read(round.name),
        })),
        unclassified: classification.unclassified,
      }
    },
    /** sheetsWriteApi.updateValues 재현 — 범위와 값의 모양이 어긋나면 조용히 넘기지 않고 던진다 */
    applyUpdate(range: string, values: string[][]): void {
      const match = RANGE_RE.exec(range)
      if (!match) throw new Error(`fake 시트가 지원하지 않는 쓰기 범위입니다: ${range}`)
      const tab = requireTab(unquoteTabName(match[1], match[2]))
      const startColumn = columnIndexOf(match[3])
      const startRow = Number(match[4])
      const width = columnIndexOf(match[5]) - startColumn + 1
      const height = Number(match[6]) - startRow + 1

      if (values.length !== height) {
        throw new Error(`쓰기 범위(${range})는 ${height}행인데 값은 ${values.length}행입니다.`)
      }
      for (const row of values) {
        if (row.length > width) {
          throw new Error(`쓰기 범위(${range})는 ${width}열인데 값 행이 ${row.length}열입니다.`)
        }
      }

      values.forEach((row, rowOffset) => {
        row.forEach((cell, columnOffset) => {
          setCell(tab, startRow - 1 + rowOffset, startColumn + columnOffset, cell)
        })
      })
    },
    /** sheetsWriteApi.batchUpdate 재현 — create-sheet가 쓰는 addSheet + updateCells만 지원 */
    applyBatchUpdate(requests: unknown[]): void {
      for (const request of requests) {
        const addSheet = pick(pick(request, 'addSheet'), 'properties')
        if (addSheet) {
          const title = String(pick(addSheet, 'title'))
          const sheetId = Number(pick(addSheet, 'sheetId'))
          // 실제 Sheets API도 같은 이름의 탭을 두 번 만들면 4xx로 거절한다.
          if (tabs.has(title)) throw new Error(`이미 존재하는 탭을 addSheet 했습니다: ${title}`)
          tabs.set(title, { sheetId, values: [] })
          continue
        }

        const updateCells = pick(request, 'updateCells')
        if (!updateCells) throw new Error(`fake 시트가 지원하지 않는 batchUpdate 요청입니다: ${JSON.stringify(request)}`)

        const start = pick(updateCells, 'start')
        const targetSheetId = Number(pick(start, 'sheetId'))
        const target = [...tabs.values()].find((tab) => tab.sheetId === targetSheetId)
        if (!target) throw new Error(`updateCells 대상 sheetId를 찾을 수 없습니다: ${targetSheetId}`)

        const startRowIndex = Number(pick(start, 'rowIndex') ?? 0)
        const startColumnIndex = Number(pick(start, 'columnIndex') ?? 0)
        const rows = pick(updateCells, 'rows')
        if (!Array.isArray(rows)) throw new Error('updateCells에 rows가 없습니다.')

        rows.forEach((row, rowOffset) => {
          const cells = pick(row, 'values')
          if (!Array.isArray(cells)) return
          cells.forEach((cell, columnOffset) => {
            const entered = pick(cell, 'userEnteredValue')
            // formulaValue는 수식 그대로 저장한다 — 평가는 읽기 시점(evaluate)의 몫.
            const value = pick(entered, 'formulaValue') ?? pick(entered, 'stringValue') ?? ''
            setCell(target, startRowIndex + rowOffset, startColumnIndex + columnOffset, String(value))
          })
        })
      }
    },
  }
}

// batchUpdate requests는 unknown[] 계약이라(create-sheet.ts) 목킹 쪽에서 좁혀 읽는다 — as 단언 없이.
function pick(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null && key in source
    ? (source as Record<string, unknown>)[key]
    : undefined
}

// ── 공유 하네스(캐시 · 지연 waitUntil) ───────────────────────────────────
// Cache API 변경 작업은 실제 I/O라 호출한 틱 안에서 끝나지 않는다 — 핸들러가 await하지 않으면
// 응답을 돌려주는 시점에 아직 반영돼 있지 않다는 뜻이다. 그 "아직 아님"을 재현하려고 효과를 다음
// 매크로태스크로 미룬다: await한 핸들러는 그 지점에서 이벤트 루프에 양보하므로 응답 전에 반영되고,
// waitUntil에만 실은 핸들러는 응답 후까지 반영되지 않는다. 효과를 호출 즉시 적용하면 두 경우가
// 구분되지 않아 #161(create-sheet purge가 waitUntil에 실려 있던 회귀)이 그대로 통과한다.
function afterIo<T>(effect: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(effect())
      } catch (err) {
        reject(err)
      }
    }, 0)
  })
}

function makeFakeCache() {
  const store = new Map<string, Response>()
  return {
    store,
    // match는 미루지 않는다 — 핸들러가 항상 await하므로 신호를 더하지 못하는 데다, 밀려 있던
    // delete가 그 틈에 실행돼 오히려 위 회귀를 가려버린다.
    match: vi.fn(async (request: Request) => {
      const stored = store.get(request.url)
      return stored ? stored.clone() : undefined
    }),
    put: vi.fn((request: Request, response: Response) =>
      afterIo(() => {
        // Workers Cache API는 no-store 응답 저장을 거절한다 — records.ts가 저장 사본과 클라이언트
        // 응답의 Cache-Control을 뒤바꿔 달면(#162 회귀) 여기서 시끄럽게 터진다.
        if ((response.headers.get('Cache-Control') ?? '').includes('no-store')) {
          throw new TypeError('Cache API: Cache-Control: no-store 응답은 저장할 수 없습니다.')
        }
        store.set(request.url, response.clone())
      }),
    ),
    delete: vi.fn((request: Request) => afterIo(() => store.delete(request.url))),
  }
}

function makeHarness(sheet: ReturnType<typeof makeFakeSheet>) {
  const cache = makeFakeCache()
  vi.stubGlobal('caches', { default: cache })

  // 지연 큐 — 이 파일의 핵심 장치. 핸들러가 waitUntil에 실은 작업은 flush()를 부를 때까지
  // 실행되지 않으므로, "응답 시점에 이미 끝나 있어야 하는 일"(무효화)과 "나중이어도 되는 일"
  // (엣지 캐시 적재)이 테스트 안에서 구분된다.
  const pending: Promise<unknown>[] = []
  const waitUntil = (promise: Promise<unknown>) => {
    pending.push(promise)
  }
  const flush = async () => {
    await Promise.all(pending.splice(0))
  }

  function getContext() {
    return { env: ENV, waitUntil } as unknown as Parameters<typeof onRequestGet>[0]
  }

  function postContext(path: string, body: unknown) {
    const request = new Request(`https://bernice.example${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { env: ENV, request, waitUntil } as unknown as Parameters<typeof postAdminRecords>[0]
  }

  async function getRecords(): Promise<{ response: Response; body: RecordsResponse }> {
    const response = await onRequestGet(getContext())
    return { response, body: (await response.clone().json()) as RecordsResponse }
  }

  /** ① GET로 캐시를 적재하고 그 사본이 실제로 저장될 때까지 기다린다(여기서만 flush). */
  async function primeCache(): Promise<RecordsResponse> {
    const { body } = await getRecords()
    await flush()
    expect(cache.store.has(RECORDS_CACHE_KEY)).toBe(true)
    return body
  }

  return { cache, sheet, flush, getRecords, primeCache, postContext }
}

let sheet: ReturnType<typeof makeFakeSheet>
let harness: ReturnType<typeof makeHarness>

beforeEach(() => {
  sheet = makeFakeSheet([
    { title: ROSTER_TAB, sheetId: 0, values: ROSTER_ROWS },
    { title: GOALS_TAB, sheetId: 11, values: GOALS_ROWS },
    { title: OLD_ROUND, sheetId: 22, values: OLD_ROUND_ROWS },
  ])
  harness = makeHarness(sheet)

  fetchSheetBundleMock.mockImplementation(async () => sheet.bundle())
  getSheetsMock.mockImplementation(async () => sheet.metas())
  getTabTitlesMock.mockImplementation(async () => sheet.titles())
  batchGetMock.mockImplementation(async (_env: unknown, _id: string, ranges: string[]) => sheet.batchGet(ranges))
  updateValuesMock.mockImplementation(async (_env: unknown, _id: string, range: string, values: string[][]) => {
    sheet.applyUpdate(range, values)
  })
  batchUpdateMock.mockImplementation(async (_env: unknown, _id: string, requests: unknown[]) => {
    sheet.applyBatchUpdate(requests)
    return {}
  })
})

afterEach(async () => {
  // 남은 waitUntil 작업까지 정리해 테스트 간 누수·미처리 rejection을 막는다.
  await harness.flush()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  fetchSheetBundleMock.mockReset()
  getSheetsMock.mockReset()
  getTabTitlesMock.mockReset()
  batchGetMock.mockReset()
  updateValuesMock.mockReset()
  batchUpdateMock.mockReset()
})

function entryOf(body: RecordsResponse, sessionDate: string, name: string) {
  const session = body.sessions.find((candidate) => candidate.date === sessionDate)
  expect(session, `${sessionDate} 회차가 응답에 없습니다`).toBeDefined()
  return session!.entries.find((entry) => entry.name === name)
}

describe('쓰기 → 조회 최신성 (#165)', () => {
  describe('POST /api/admin/records — 점수 저장 직후', () => {
    it('응답 직후의 GET가 flush 없이 바뀐 점수를 반환한다', async () => {
      // ① 캐시 적재 — 저장 전 값 확인
      const before = await harness.primeCache()
      expect(entryOf(before, OLD_ROUND, '가은')!.scores['골밑슛']).toEqual({
        status: 'recorded',
        value: 5,
        display: '5',
      })

      // ② 쓰기 — 가은의 골밑슛 5 → 9
      const response = await postAdminRecords(
        harness.postContext('/api/admin/records', {
          sessionDate: OLD_ROUND,
          playerId: 1,
          scores: { 드리블셔틀런: '1:12', 골밑슛: '9', 자유투: '2' },
        }),
      )
      expect(response.status).toBe(200)
      // 무효화는 응답 전에 끝나 있어야 한다 — waitUntil 큐를 flush하지 않은 지금 이미 비어 있어야 통과.
      expect(harness.cache.store.has(RECORDS_CACHE_KEY)).toBe(false)

      // ③ flush 없이 즉시 GET
      const { body: after } = await harness.getRecords()
      expect(entryOf(after, OLD_ROUND, '가은')!.scores['골밑슛']).toEqual({
        status: 'recorded',
        value: 9,
        display: '9',
      })
    })

    it('바뀐 점수가 같은 응답의 랭킹·추이·홈 달성률까지 관통한다', async () => {
      await harness.primeCache()

      await postAdminRecords(
        harness.postContext('/api/admin/records', {
          sessionDate: OLD_ROUND,
          playerId: 1,
          scores: { 드리블셔틀런: '1:12', 골밑슛: '9', 자유투: '2' },
        }),
      )

      const { body } = await harness.getRecords()

      // 랭킹: 골밑슛 1위가 다현(7)에서 가은(9)으로 바뀐다.
      const ranking = body.rankings.find((r) => r.sessionDate === OLD_ROUND)!.events.find((e) => e.event === '골밑슛')!
      expect(ranking.entries[0]).toMatchObject({ name: '가은', value: 9, rank: 1 })

      // 추이: 가은의 골밑슛 포인트가 새 값으로 갱신된다.
      const trend = body.players.find((p) => p.name === '가은')!.trends.find((t) => t.event === '골밑슛')!
      expect(trend.points.map((point) => point.value)).toEqual([9])

      // 홈: 목표 5 이상 달성자가 3명 전원(5·6·7 → 9·6·7)이라 달성률은 그대로 1이지만,
      // 응답이 옛 캐시가 아니라 새로 조립된 것임은 위 두 어서션이 이미 고정한다.
      const rate = body.home.achievementRates.find((r) => r.event === '골밑슛')!
      expect(rate).toMatchObject({ achievedCount: 3, eligibleCount: 3, rate: 1 })
    })
  })

  describe('POST /api/admin/create-sheet — 회차 생성 직후', () => {
    beforeEach(() => {
      // create-sheet는 오늘(KST)로 탭 이름을 정한다 — 실행 날짜에 따라 픽스처와 충돌하지 않게 고정.
      // Date만 가짜로 돌린다: setTimeout까지 멈추면 위 afterIo(실제 I/O 지연 재현)가 영영 끝나지 않아
      // await purgeRecordsCache()가 교착에 빠진다.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-07-23T03:00:00Z')) // KST 12:00 → 2026-07-23
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('201 응답 직후의 GET가 flush 없이 새 회차를 포함한다', async () => {
      // ① 캐시 적재 — 아직 회차는 하나뿐
      const before = await harness.primeCache()
      expect(before.sessions.map((session) => session.date)).toEqual([OLD_ROUND])

      // ② 쓰기 — 가은·라온으로 오늘 회차 생성
      const response = await postCreateSheet(harness.postContext('/api/admin/create-sheet', { participantIds: [4, 1] }))
      expect(response.status).toBe(201)
      expect(harness.cache.store.has(RECORDS_CACHE_KEY)).toBe(false)

      // ③ flush 없이 즉시 GET — 새 회차가 참가자·측정 종목과 함께 보인다.
      const { body: after } = await harness.getRecords()
      expect(after.sessions.map((session) => session.date)).toEqual([OLD_ROUND, NEW_ROUND])

      const created = after.sessions.find((session) => session.date === NEW_ROUND)!
      expect(created.eventKeys).toEqual(['드리블셔틀런', '골밑슛', '자유투'])
      expect(created.entries.map((entry) => entry.name)).toEqual(['가은', '라온']) // 가나다 정렬
      // 빈 점수로 만들어진 탭이라 아직 아무도 참여하지 않은 상태여야 한다.
      expect(created.entries.every((entry) => !entry.participated)).toBe(true)
      expect(after.home.latestSession).toEqual({ date: NEW_ROUND, participantCount: 0 })
    })

    it('새 탭의 이름·종목 셀은 참조 수식으로 쓰이고, 조회는 그 평가값을 본다', async () => {
      await harness.primeCache()
      await postCreateSheet(harness.postContext('/api/admin/create-sheet', { participantIds: [1] }))

      // 시트에 남은 원본은 수식 — 명단/목표가 바뀌면 회차 탭이 따라오는 실제 운영 포맷 그대로.
      expect(sheet.rawValues(NEW_ROUND)[1][0]).toBe(`='${ROSTER_TAB}'!A2`)
      expect(sheet.rawValues(NEW_ROUND)[0][1]).toBe(`='${GOALS_TAB}'!A2`)

      const { body } = await harness.getRecords()
      expect(entryOf(body, NEW_ROUND, '가은')).toBeDefined()
    })
  })

  describe('POST /api/admin/add-players — 참가자 추가 직후', () => {
    it('응답 직후의 GET가 flush 없이 새 참가자를 포함한다', async () => {
      // ① 캐시 적재 — 라온은 아직 그 회차 참가자가 아니다
      const before = await harness.primeCache()
      expect(entryOf(before, OLD_ROUND, '라온')).toBeUndefined()
      expect(before.sessions[0].entries).toHaveLength(3)

      // ② 쓰기 — 라온 추가
      const response = await postAddPlayers(
        harness.postContext('/api/admin/add-players', { sessionDate: OLD_ROUND, playerIds: [4] }),
      )
      expect(response.status).toBe(200)
      expect(harness.cache.store.has(RECORDS_CACHE_KEY)).toBe(false)

      // ③ flush 없이 즉시 GET — A열 수식이 평가된 이름으로 참가자에 잡힌다.
      const { body: after } = await harness.getRecords()
      const added = entryOf(after, OLD_ROUND, '라온')
      expect(added).toBeDefined()
      expect(added).toMatchObject({ playerId: 4, participated: false })
      expect(after.sessions[0].entries.map((entry) => entry.name)).toEqual(['가은', '나래', '다현', '라온'])
    })
  })
})

// #162 — 브라우저 캐시와 엣지 캐시의 Cache-Control을 분리한다: 클라이언트가 받는 응답은 항상
// no-store(관리자 저장 직후 refetch가 네트워크에 닿아야 한다), 엣지에 저장되는 사본만 max-age.
// 위 시나리오들과 같은 하네스에서 함께 본다 — 두 계약이 같은 응답 생성 경로를 공유하기 때문.
describe('캐시 계층 분리 헤더 계약 (#162)', () => {
  it('미스 응답은 no-store로 나가고, 엣지에 저장되는 사본만 max-age를 단다', async () => {
    const { response } = await harness.getRecords()
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    await harness.flush()
    expect(harness.cache.put).toHaveBeenCalledTimes(1)
    const stored = harness.cache.store.get(RECORDS_CACHE_KEY)!
    expect(stored.headers.get('Cache-Control')).toBe(`public, max-age=${RECORDS_CACHE_TTL_SECONDS}`)
  })

  it('히트 응답도 no-store로 바뀌어 나가고, 그 요청은 시트를 다시 읽지 않는다', async () => {
    await harness.primeCache()
    expect(fetchSheetBundleMock).toHaveBeenCalledTimes(1)

    const { response, body } = await harness.getRecords()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchSheetBundleMock).toHaveBeenCalledTimes(1) // 히트 — 시트 재조회 없음
    expect(body.sessions.map((session) => session.date)).toEqual([OLD_ROUND])
  })
})
