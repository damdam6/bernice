// Goals A:F keep their legacy meaning. G (종목 ID) selects explicit-ID mode;
// optional H (이전 종목명) preserves one immutable alias during migration.
// Without G, IDs use the original sheet row (legacy-row-N), never the current name.
// Row moves/deletions remain prohibited until #178 has persisted IDs and converted headers.

import { RANK_DIRECTIONS, type EventDefinition, type RankDirection } from '../../shared/domain'
import { isEventId } from '../../shared/event-identity'
import { normalizeScore } from '../../shared/normalize-score'
import { isValidRoundTabName } from './sheetTabs'

const EXPECTED_HEADER = ['종목', '목표', '만점', '방향', '종료 회차']
const EXEMPTABLE_HEADER = '면제 가능'
const EXEMPTABLE_LITERAL = '가능'
// 만점·종료 회차·면제 가능 세 열이 공유하는 "빈칸 또는 -" = 없음 관례(docs/prd-event-lifecycle.html §03 D1).
const NULL_LITERALS = new Set(['', '-'])
const INTEGER_RE = /^\d+$/

export interface ParseGoalsResult {
  events: EventDefinition[]
  /** 종목 key → 목표 탭 실제 행 번호(내부 전용, 위 파일 docblock 참고) */
  sheetRowById: Map<string, number>
  identityMode: 'legacy' | 'id'
}

export function parseGoals(rows: string[][]): ParseGoalsResult {
  if (rows.length === 0) return { events: [], sheetRowById: new Map(), identityMode: 'legacy' }
  const hasExemptableColumn = validateHeader(rows[0])

  const idHeader = (rows[0][6] ?? '').trim()
  if (idHeader !== '' && idHeader !== '종목 ID') throw new Error('목표 탭 G1 헤더는 종목 ID여야 합니다')
  const hasIdColumn = idHeader === '종목 ID'
  const aliasHeader = (rows[0][7] ?? '').trim()
  if (aliasHeader !== '' && aliasHeader !== '이전 종목명') throw new Error('목표 탭 H1 헤더는 이전 종목명이어야 합니다')
  const hasAliasColumn = (rows[0][7] ?? '').trim() === '이전 종목명'
  if (hasAliasColumn && !hasIdColumn) throw new Error('이전 종목명 열은 종목 ID 열과 함께 사용해야 합니다')
  const events: EventDefinition[] = []
  const legacyNames = new Set<string>()
  const sheetRowById = new Map<string, number>()

  rows.slice(1).forEach((row, index) => {
    const sheetRow = index + 2 // 헤더(1행) 다음부터 시작 — 스킵된 행이 있어도 밀리지 않음
    if (row.every((cell) => (cell ?? '').trim() === '')) return

    const event = parseGoalRow(row, sheetRow, hasExemptableColumn)

    if (!hasIdColumn && (row[6] ?? '') !== '') fail(sheetRow, event.name, '종목 ID 값이 있는데 G1 헤더가 없음')
    if (!hasAliasColumn && (row[7] ?? '').trim() !== '') fail(sheetRow, event.name, '이전 종목명 값이 있는데 H1 헤더가 없음')
    if (hasIdColumn) {
      const id = row[6] ?? ''
      if (!isEventId(id)) fail(sheetRow, event.name, '종목 ID가 비어 있거나 형식이 올바르지 않음')
      event.id = id
      const alias = hasAliasColumn ? (row[7] ?? '').trim().normalize('NFC') : ''
      if (alias) event.legacyName = alias
    } else {
      if (legacyNames.has(event.name)) fail(sheetRow, event.name, '종목명이 중복됨 — ID 형식으로 먼저 이전하세요')
      if (event.name.startsWith('id:')) fail(sheetRow, event.name, 'id: 접두사는 ID 헤더용으로 예약되어 있습니다')
      legacyNames.add(event.name)
    }

    const firstSeenRow = sheetRowById.get(event.id)
    if (firstSeenRow !== undefined) {
      fail(sheetRow, event.id, `종목 ID가 중복됨 (이미 ${firstSeenRow}행에서 같은 ID 사용됨)`)
    }
    sheetRowById.set(event.id, sheetRow)

    events.push(event)
  })

  return { events, sheetRowById, identityMode: hasIdColumn ? 'id' : 'legacy' }
}

// 반환값 = F열(면제 가능) 헤더 존재 여부. 앞 5열은 기존대로 prefix 강제, F1은 "없으면 5열
// 과도기 / 있으면 정확히 '면제 가능'"의 셋 중 하나만 허용한다.
function validateHeader(header: string[]): boolean {
  const cells = header.map((cell) => (cell ?? '').trim())
  const matches = EXPECTED_HEADER.every((expected, i) => cells[i] === expected)
  if (!matches) {
    throw new Error(`목표 탭 헤더가 예상과 다릅니다 — 기대 [${EXPECTED_HEADER.join(' | ')}], 실제 [${cells.join(' | ')}]`)
  }
  const sixth = cells[5] ?? ''
  if (sixth === '') return false
  if (sixth !== EXEMPTABLE_HEADER) {
    throw new Error(
      `목표 탭 F1 헤더가 예상과 다릅니다 — 기대 "${EXEMPTABLE_HEADER}"(또는 빈칸 = 5열 스키마), 실제 "${sixth}"`,
    )
  }
  return true
}

function parseGoalRow(row: string[], sheetRow: number, hasExemptableColumn: boolean): EventDefinition {
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
    id: `legacy-row-${sheetRow}`,
    name: name.normalize('NFC'),
    valueKind: score.kind === 'seconds' ? 'time' : 'count',
    target: targetRaw.trim(),
    targetValue: score.value,
    maxScore: parseMaxScore(row[2] ?? '', sheetRow, name),
    direction: parseDirection(row[3] ?? '', sheetRow, name),
    endSessionDate: parseEndSessionDate(row[4] ?? '', sheetRow, name),
    exemptable: parseExemptable(row[5] ?? '', sheetRow, name, hasExemptableColumn),
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

// 빈칸/- = 불가(false), '가능' = 면제 가능(true) — 만점·종료 회차와 같은 "없음" 관례.
// F1 헤더가 없는 5열 과도기에는 전 종목 false지만, 값만 먼저 기입된 셀은 의도 불명(헤더 누락
// 실수 가능성)이라 조용히 무시하지 않고 fail-loud로 헤더부터 추가하도록 안내한다.
function parseExemptable(raw: string, sheetRow: number, name: string, hasExemptableColumn: boolean): boolean {
  const trimmed = raw.trim().normalize('NFKC')
  if (!hasExemptableColumn) {
    if (trimmed !== '') {
      fail(sheetRow, name, `면제 가능 값("${raw}")이 있는데 F1 헤더("${EXEMPTABLE_HEADER}")가 없음 — 헤더를 먼저 추가하세요`)
    }
    return false
  }
  if (NULL_LITERALS.has(trimmed)) return false
  if (trimmed !== EXEMPTABLE_LITERAL) {
    fail(sheetRow, name, `면제 가능 값이 올바르지 않음 ("${EXEMPTABLE_LITERAL}"·빈칸·"-"만 허용): "${raw}"`)
  }
  return true
}

function fail(sheetRow: number, name: string, reason: string): never {
  throw new Error(`목표 탭 파싱 실패 (${sheetRow}행 "${name || '(빈 종목명)'}"): ${reason}`)
}
