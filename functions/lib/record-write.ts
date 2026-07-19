// POST /api/admin/records(#64)의 순수 헬퍼 — 회차 탭에서 대상 행 찾기 · A1 점수 범위 조립 ·
// 요청 점수 검증(EventScore 조립)을 담당한다. Sheets API 호출·오케스트레이션은 엔드포인트
// (functions/api/admin/records.ts)가 맡고, 값 검증/헤더 매핑 규칙은 parse-session.ts를 재사용해
// "규칙 원천은 하나"(PRD §08)를 지킨다.

import type { EventDefinition, EventScore } from '../../shared/domain'
import { buildEventScore, mapHeaderToEvents, type EventColumn } from './parse-session'
import { quoteSheetName } from './sheetsApi'

export { mapHeaderToEvents, type EventColumn }

// 1-based 열 번호 → A1 열 문자 (1→A, 2→B, 26→Z, 27→AA). 점수 열은 실제로 B(2)부터 몇 칸이지만,
// 열 순서를 가정하지 않고 mapHeaderToEvents가 돌려준 columnIndex로부터 계산한다.
export function columnLetter(columnNumber: number): string {
  if (!Number.isInteger(columnNumber) || columnNumber < 1) {
    throw new Error(`열 번호는 1 이상의 정수여야 합니다: ${columnNumber}`)
  }
  let n = columnNumber
  let letters = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export type ParticipantLocation = { kind: 'found'; rowNumber: number } | { kind: 'not_participant' }

// 회차 탭 이름 열(A)에서 targetNameNFC와 NFC 일치하는 데이터 행의 시트 행 번호(1-based, 헤더=1행)를
// 찾는다. 0건 → not_participant(정상 404 경로), 2건 이상 → 대상 행을 특정할 수 없어 Error를 던진다
// (parse-session의 동명 중복 처리와 같은 fail-loud — 엉뚱한 행을 덮어쓰는 것보다 안전).
export function locateParticipantRow(rows: string[][], targetNameNFC: string): ParticipantLocation {
  const matchedRows: number[] = []
  for (let index = 1; index < rows.length; index++) {
    const nameCell = (rows[index]?.[0] ?? '').trim()
    if (nameCell === '') continue
    if (nameCell.normalize('NFC') === targetNameNFC) {
      matchedRows.push(index + 1) // 배열 인덱스 0=헤더(1행)이므로 시트 행 번호 = index + 1
    }
  }

  if (matchedRows.length === 0) return { kind: 'not_participant' }
  if (matchedRows.length > 1) {
    throw new Error(
      `회차 탭 이름 열에 "${targetNameNFC}"가 ${matchedRows.length}개 행(${matchedRows.join(', ')}행)에 중복으로 있어 대상 행을 특정할 수 없습니다`,
    )
  }
  return { kind: 'found', rowNumber: matchedRows[0] }
}

export interface ScoreKeyValidation {
  /** 요청에 빠진 종목 key (events엔 있으나 scores에 없음) */
  missing: string[]
  /** 요청의 알 수 없는 key (scores엔 있으나 events에 없음) */
  unknown: string[]
}

// scores의 key 집합이 events[] 전체 key와 정확히 일치하는지 검사한다(행 전체 교체 upsert라
// 누락·미지 key 모두 거부). 비교는 NFC 정규화 후 — 종목명이 NFD로 들어와도 매칭되게.
export function validateScoreKeys(
  scores: Record<string, string>,
  events: EventDefinition[],
): ScoreKeyValidation {
  const eventNfcKeys = new Set(events.map((event) => event.key.normalize('NFC')))
  const requestNfcKeys = new Set(Object.keys(scores).map((key) => key.normalize('NFC')))

  const missing = events.filter((event) => !requestNfcKeys.has(event.key.normalize('NFC'))).map((event) => event.key)
  const unknown = Object.keys(scores).filter((key) => !eventNfcKeys.has(key.normalize('NFC')))
  return { missing, unknown }
}

export interface ScoreEvaluation {
  /** key = event.key, events 순서. 200 응답의 scores 그대로 */
  scoreMap: Record<string, EventScore>
  /** invalid로 판정된 종목·사유 (하나라도 있으면 400, 시트에 쓰지 않음) */
  invalid: { event: string; reason: string }[]
}

// 각 종목 셀을 normalize-score + valueKind 교차검증(buildEventScore 재사용)으로 EventScore로 만든다.
// key 검증(validateScoreKeys)이 선행됐다고 가정하지만, 누락 key는 빈 문자열(미측정)로 안전하게 처리한다.
export function evaluateScores(scores: Record<string, string>, events: EventDefinition[]): ScoreEvaluation {
  const requestByNfc = new Map(Object.keys(scores).map((key) => [key.normalize('NFC'), scores[key]]))
  const scoreMap: Record<string, EventScore> = {}
  const invalid: { event: string; reason: string }[] = []

  for (const event of events) {
    const raw = requestByNfc.get(event.key.normalize('NFC')) ?? ''
    const score = buildEventScore(raw, event)
    scoreMap[event.key] = score
    if (score.status === 'invalid') invalid.push({ event: event.key, reason: score.reason })
  }
  return { scoreMap, invalid }
}

export interface WritePlan {
  /** A1 표기 전체 범위 (예: "'2025-08-16'!B7:E7") — 점수 셀만, 이름 열·헤더 제외 */
  range: string
  /** values.update 바디의 values — 헤더 열 순서로 재배열한 원본 문자열 1행 */
  values: string[][]
}

// 점수 셀 범위와 쓰기 값을 조립한다. eventColumns는 mapHeaderToEvents가 columnIndex 오름차순으로
// 돌려주고, 이름 열(A) 뒤 모든 열이 종목이라 열이 연속임이 보장된다 — 그래서 첫·마지막 종목 열로만
// 범위를 잡아도 그 사이가 전부 점수 칸이다. 값은 요청 원본 문자열을 헤더 열 순서대로 재배열해
// RAW로 쓴다(요청 key 순서가 아님 — 다른 칸에 값이 새는 것을 막는다).
export function buildWritePlan(
  tabName: string,
  rowNumber: number,
  eventColumns: EventColumn[],
  scores: Record<string, string>,
): WritePlan {
  if (eventColumns.length === 0) {
    throw new Error('종목 열이 없어 쓰기 범위를 만들 수 없습니다.')
  }
  const requestByNfc = new Map(Object.keys(scores).map((key) => [key.normalize('NFC'), scores[key]]))
  const firstColumnIndex = eventColumns[0].columnIndex
  const lastColumnIndex = eventColumns[eventColumns.length - 1].columnIndex

  const rowValues = eventColumns.map((column) => requestByNfc.get(column.event.key.normalize('NFC')) ?? '')
  const range = `${quoteSheetName(tabName)}!${columnLetter(firstColumnIndex + 1)}${rowNumber}:${columnLetter(
    lastColumnIndex + 1,
  )}${rowNumber}`

  return { range, values: [rowValues] }
}
