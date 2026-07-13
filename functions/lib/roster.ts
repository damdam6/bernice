import type { Player } from '../../shared/domain'
import { normalizeStatus } from './normalize-status'

export interface RosterRowIssue {
  /** 1-based, 헤더 제외 원본 행 위치 (시트 행 번호 - 1) */
  rowIndex: number
  reason: string
}

export interface RosterParseResult {
  players: Player[]
  issues: RosterRowIssue[]
}

/** 버니스명단 원시 2D 배열(헤더: 이름 | 상태)을 Player[]로 변환한다.
 *  id는 데이터 행의 원본 배열 인덱스+1 — 완전 빈 행을 스킵해도 당겨서 재계산하지 않는다.
 *  회차 탭이 이 행 위치를 절대값으로 참조하므로(docs/sheet-rules.html §01), id가 실제
 *  시트 행과 어긋나면 이후 회차 매칭이 통째로 틀어진다. */
export function parseRoster(rows: string[][]): RosterParseResult {
  const [, ...dataRows] = rows
  const players: Player[] = []
  const issues: RosterRowIssue[] = []

  dataRows.forEach((row, index) => {
    const rowIndex = index + 1
    const rawName = (row[0] ?? '').trim()
    const rawStatus = (row[1] ?? '').trim()

    if (rawName === '' && rawStatus === '') return

    if (rawName === '') {
      issues.push({ rowIndex, reason: '이름 없음' })
      return
    }

    const status = normalizeStatus(rawStatus)
    if (status.kind === 'unknown') {
      issues.push({
        rowIndex,
        reason: rawStatus === '' ? '상태 없음' : `알 수 없는 상태값: "${rawStatus}"`,
      })
      return
    }

    players.push({ id: rowIndex, name: rawName.normalize('NFC'), status: status.value })
  })

  return { players, issues }
}
