// 목표 탭 원시 2D 배열 → EventDefinition[]. 열 순서: 종목 | 목표 | 만점 | 방향 (헤더 1행).
// 스키마 근거: docs/sheet-integration.html §02. 값 정규화는 normalize-score.ts(이슈 #6)를 재사용.
//
// 목표 탭은 회차마다 바뀌지 않는 설정 시트(팀 운영자가 드물게 편집)라, 회차 점수 셀과 달리
// EventDefinition에는 "이상값"을 실을 슬롯이 없다(EventScore.invalid와 대비). 그래서 행 파싱이
// 실패하면 시트 행 번호·종목명을 담아 즉시 throw한다 — 운영자가 바로 시트에서 원인 셀을 찾을 수 있게.
// 완전 공백 행만 예외적으로 스킵한다(#24 Sheets API 래퍼가 아직 없어 batchGet range가 데이터
// 끝보다 넓게 잡혀 trailing 빈 행이 섞여 올 가능성을 배제할 수 없음).

import { RANK_DIRECTIONS, type EventDefinition, type RankDirection } from '../../shared/domain'
import { normalizeScore } from './normalize-score'

const MAX_SCORE_NULL_LITERALS = new Set(['', '-'])
const INTEGER_RE = /^\d+$/

export function parseGoals(rows: string[][]): EventDefinition[] {
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => (cell ?? '').trim() !== ''))
    .map((row, index) => parseGoalRow(row, index))
}

function parseGoalRow(row: string[], index: number): EventDefinition {
  const sheetRow = index + 2 // 헤더(1행) 다음부터 시작
  const name = (row[0] ?? '').trim()
  if (name === '') fail(sheetRow, name, '종목명이 비어 있음')

  const targetRaw = row[1] ?? ''
  const score = normalizeScore(targetRaw)
  if (score.kind !== 'count' && score.kind !== 'seconds') {
    fail(sheetRow, name, `목표치 형식이 올바르지 않음: "${targetRaw}"`)
  }

  return {
    key: name.normalize('NFC'),
    valueKind: score.kind === 'seconds' ? 'time' : 'count',
    target: targetRaw,
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
