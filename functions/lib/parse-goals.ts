// 목표 탭 원시 2D 배열 → EventDefinition[]. 열 순서: 종목 | 목표 | 만점 | 방향 | 종료 회차 (헤더 1행).
// 스키마 근거: docs/prd-event-lifecycle.html §04(5열 스키마) · docs/sheet-integration.html §02.
// 값 정규화는 normalize-score.ts(이슈 #6)를 재사용.
//
// 목표 탭은 회차마다 바뀌지 않는 설정 시트(팀 운영자가 드물게 편집)라, 회차 점수 셀과 달리
// EventDefinition에는 "이상값"을 실을 슬롯이 없다(EventScore.invalid와 대비). 그래서 행 파싱이
// 실패하면 시트 행 번호·종목명을 담아 즉시 throw한다 — 운영자가 바로 시트에서 원인 셀을 찾을 수 있게.
// 완전 공백 행만 예외적으로 스킵한다(#24 Sheets API 래퍼가 아직 없어 batchGet range가 데이터
// 끝보다 넓게 잡혀 trailing 빈 행이 섞여 올 가능성을 배제할 수 없음) — parse-session.ts(#27)와
// 동일하게, 스킵 여부와 무관하게 각 행의 시트 행 번호는 원본 배열 위치 기준으로 고정한다.
//
// 반환값의 sheetRowByKey(종목 key → 그 종목의 목표 탭 실제 행 번호)는 RecordsResponse 공개 계약에는
// 노출되지 않는 내부 부산물이다 — create-sheet(#121)가 헤더 참조 수식(=목표!A{행})을 지을 때 쓴다.

import { RANK_DIRECTIONS, type EventDefinition, type RankDirection } from '../../shared/domain'
import { normalizeScore } from '../../shared/normalize-score'
import { isValidRoundTabName } from './sheetTabs'

const EXPECTED_HEADER = ['종목', '목표', '만점', '방향', '종료 회차']
// 만점·종료 회차 두 열이 공유하는 "빈칸 또는 -" = null 관례(docs/prd-event-lifecycle.html §03 D1).
const NULL_LITERALS = new Set(['', '-'])
const INTEGER_RE = /^\d+$/

export interface ParseGoalsResult {
  events: EventDefinition[]
  /** 종목 key → 목표 탭 실제 행 번호(내부 전용, 위 파일 docblock 참고) */
  sheetRowByKey: Map<string, number>
}

export function parseGoals(rows: string[][]): ParseGoalsResult {
  if (rows.length === 0) return { events: [], sheetRowByKey: new Map() }
  validateHeader(rows[0])

  const events: EventDefinition[] = []
  const sheetRowByKey = new Map<string, number>()

  rows.slice(1).forEach((row, index) => {
    const sheetRow = index + 2 // 헤더(1행) 다음부터 시작 — 스킵된 행이 있어도 밀리지 않음
    if (row.every((cell) => (cell ?? '').trim() === '')) return

    const event = parseGoalRow(row, sheetRow)

    const firstSeenRow = sheetRowByKey.get(event.key)
    if (firstSeenRow !== undefined) {
      fail(sheetRow, event.key, `종목명이 중복됨 (이미 ${firstSeenRow}행에서 같은 종목명 사용됨)`)
    }
    sheetRowByKey.set(event.key, sheetRow)

    events.push(event)
  })

  return { events, sheetRowByKey }
}

function validateHeader(header: string[]): void {
  const cells = header.map((cell) => (cell ?? '').trim())
  const matches = EXPECTED_HEADER.every((expected, i) => cells[i] === expected)
  if (!matches) {
    throw new Error(`목표 탭 헤더가 예상과 다릅니다 — 기대 [${EXPECTED_HEADER.join(' | ')}], 실제 [${cells.join(' | ')}]`)
  }
}

function parseGoalRow(row: string[], sheetRow: number): EventDefinition {
  const name = (row[0] ?? '').trim()
  if (name === '') fail(sheetRow, name, '종목명이 비어 있음')

  const targetRaw = row[1] ?? ''
  const score = normalizeScore(targetRaw)
  if (score.kind !== 'count' && score.kind !== 'seconds') {
    const detail =
      score.kind === 'invalid' ? score.reason : `목표치가 비어 있거나 면제로는 쓸 수 없음 (raw: "${targetRaw}")`
    fail(sheetRow, name, `목표치 형식이 올바르지 않음: ${detail}`)
  }

  return {
    key: name.normalize('NFC'),
    valueKind: score.kind === 'seconds' ? 'time' : 'count',
    target: targetRaw.trim(),
    targetValue: score.value,
    maxScore: parseMaxScore(row[2] ?? '', sheetRow, name),
    direction: parseDirection(row[3] ?? '', sheetRow, name),
    endSessionDate: parseEndSessionDate(row[4] ?? '', sheetRow, name),
  }
}

function parseMaxScore(raw: string, sheetRow: number, name: string): number | null {
  const trimmed = raw.trim().normalize('NFKC')
  if (NULL_LITERALS.has(trimmed)) return null
  if (!INTEGER_RE.test(trimmed)) fail(sheetRow, name, `만점 형식이 올바르지 않음: "${raw}"`)
  return Number(trimmed)
}

function parseDirection(raw: string, sheetRow: number, name: string): RankDirection {
  const trimmed = raw.trim().normalize('NFKC')
  const match = RANK_DIRECTIONS.find((direction) => direction === trimmed)
  if (!match) fail(sheetRow, name, `방향 값이 올바르지 않음: "${raw}"`)
  return match
}

// 빈칸/- = 현역(null). 그 외에는 회차 탭 이름 규칙(YYYY-MM-DD + 캘린더 유효)을 그대로 재사용(V5,
// docs/prd-event-lifecycle.html §05) — 실존 회차 탭과의 대조(V6)는 회차 목록을 아는 조립 단계
// (build-records-response.ts)의 몫이라 여기서는 형식·캘린더 유효성만 본다.
function parseEndSessionDate(raw: string, sheetRow: number, name: string): string | null {
  const trimmed = raw.trim().normalize('NFKC')
  if (NULL_LITERALS.has(trimmed)) return null
  if (!isValidRoundTabName(trimmed)) {
    fail(sheetRow, name, `종료 회차 형식이 올바르지 않음 (YYYY-MM-DD 형식의 실존 날짜여야 함): "${raw}"`)
  }
  return trimmed
}

function fail(sheetRow: number, name: string, reason: string): never {
  throw new Error(`목표 탭 파싱 실패 (${sheetRow}행 "${name || '(빈 종목명)'}"): ${reason}`)
}
