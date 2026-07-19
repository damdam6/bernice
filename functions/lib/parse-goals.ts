// 목표 탭 원시 2D 배열 → EventDefinition[]. 열 순서: 종목 | 목표 | 만점 | 방향 (헤더 1행).
// 스키마 근거: docs/sheet-integration.html §02. 값 정규화는 normalize-score.ts(이슈 #6)를 재사용.
//
// 목표 탭은 회차마다 바뀌지 않는 설정 시트(팀 운영자가 드물게 편집)라, 회차 점수 셀과 달리
// EventDefinition에는 "이상값"을 실을 슬롯이 없다(EventScore.invalid와 대비). 그래서 행 파싱이
// 실패하면 시트 행 번호·종목명을 담아 즉시 throw한다 — 운영자가 바로 시트에서 원인 셀을 찾을 수 있게.
// 완전 공백 행만 예외적으로 스킵한다(#24 Sheets API 래퍼가 아직 없어 batchGet range가 데이터
// 끝보다 넓게 잡혀 trailing 빈 행이 섞여 올 가능성을 배제할 수 없음) — parse-session.ts(#27)와
// 동일하게, 스킵 여부와 무관하게 각 행의 시트 행 번호는 원본 배열 위치 기준으로 고정한다.

import { RANK_DIRECTIONS, type EventDefinition, type RankDirection } from '../../shared/domain'
import { normalizeScore } from '../../shared/normalize-score'

const EXPECTED_HEADER = ['종목', '목표', '만점', '방향']
const MAX_SCORE_NULL_LITERALS = new Set(['', '-'])
const INTEGER_RE = /^\d+$/

export function parseGoals(rows: string[][]): EventDefinition[] {
  if (rows.length === 0) return []
  validateHeader(rows[0])

  const events: EventDefinition[] = []
  const firstSeenRowByKey = new Map<string, number>()

  rows.slice(1).forEach((row, index) => {
    const sheetRow = index + 2 // 헤더(1행) 다음부터 시작 — 스킵된 행이 있어도 밀리지 않음
    if (row.every((cell) => (cell ?? '').trim() === '')) return

    const event = parseGoalRow(row, sheetRow)

    const firstSeenRow = firstSeenRowByKey.get(event.key)
    if (firstSeenRow !== undefined) {
      fail(sheetRow, event.key, `종목명이 중복됨 (이미 ${firstSeenRow}행에서 같은 종목명 사용됨)`)
    }
    firstSeenRowByKey.set(event.key, sheetRow)

    events.push(event)
  })

  return events
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
  }
}

function parseMaxScore(raw: string, sheetRow: number, name: string): number | null {
  const trimmed = raw.trim().normalize('NFKC')
  if (MAX_SCORE_NULL_LITERALS.has(trimmed)) return null
  if (!INTEGER_RE.test(trimmed)) fail(sheetRow, name, `만점 형식이 올바르지 않음: "${raw}"`)
  return Number(trimmed)
}

function parseDirection(raw: string, sheetRow: number, name: string): RankDirection {
  const trimmed = raw.trim().normalize('NFKC')
  const match = RANK_DIRECTIONS.find((direction) => direction === trimmed)
  if (!match) fail(sheetRow, name, `방향 값이 올바르지 않음: "${raw}"`)
  return match
}

function fail(sheetRow: number, name: string, reason: string): never {
  throw new Error(`목표 탭 파싱 실패 (${sheetRow}행 "${name || '(빈 종목명)'}"): ${reason}`)
}
