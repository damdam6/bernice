import type { Player } from '../../shared/domain'
import { normalizeStatus } from './normalize-status'

const NAME_HEADER = '이름'.normalize('NFC')

export interface RosterRowIssue {
  /** 1-based, 헤더 제외 원본 행 위치 (시트 행 번호 - 1) */
  rowIndex: number
  reason: string
  /** 원본 이름 셀(트림 후) — 시트에서 어느 행을 고쳐야 하는지 특정하기 위한 진단용 보존 */
  rawName: string
  /** 원본 상태 셀(트림 후) — 위와 같은 이유로 보존 */
  rawStatus: string
}

export interface RosterParseResult {
  /** id는 시트 행 위치를 그대로 반영해 결번이 있을 수 있다(빈 행·이상값 행은 스킵되지만
   *  뒤 행의 id를 당기지 않음) — sparse 배열이므로 소비자는 배열 인덱스가 아니라 id 값으로
   *  조회해야 한다(예: players.find(p => p.id === n) 또는 Map). */
  players: Player[]
  issues: RosterRowIssue[]
}

/** 버니스명단 원시 2D 배열(헤더: 이름 | 상태)을 Player[]로 변환한다.
 *  id는 데이터 행의 원본 배열 인덱스+1 — 완전 빈 행을 스킵해도 당겨서 재계산하지 않는다.
 *  회차 탭이 이 행 위치를 절대값으로 참조하므로(docs/sheet-rules.html §01), id가 실제
 *  시트 행과 어긋나면 이후 회차 매칭이 통째로 틀어진다.
 *
 *  헤더 첫 열이 "이름"이 아니면 즉시 throw한다(parse-session.ts의 헤더 검증과 동일한
 *  실패 모드) — 호출자가 데이터 전용 범위(예: A2:B)를 잘못 넘기면 1행이 조용히 데이터로
 *  둔갑해 이후 전원의 id가 1씩 밀리는, id 정합성이 핵심인 이 파서에서 가장 위험한
 *  실패 모드이기 때문에 조용히 넘기지 않는다. */
export function parseRoster(rows: string[][]): RosterParseResult {
  const header = rows[0]
  const headerFirstCell = (header?.[0] ?? '').trim().normalize('NFC')
  if (headerFirstCell !== NAME_HEADER) {
    throw new Error(`버니스명단 헤더 첫 열이 "이름"이 아닙니다: "${header?.[0] ?? ''}"`)
  }

  const dataRows = rows.slice(1)
  const players: Player[] = []
  const issues: RosterRowIssue[] = []

  dataRows.forEach((row, index) => {
    const rowIndex = index + 1
    const rawName = (row[0] ?? '').trim()
    const rawStatus = (row[1] ?? '').trim()

    if (rawName === '' && rawStatus === '') return

    if (rawName === '') {
      issues.push({ rowIndex, reason: '이름 없음', rawName, rawStatus })
      return
    }

    const status = normalizeStatus(rawStatus)
    if (status.kind !== 'known') {
      issues.push({
        rowIndex,
        reason: status.kind === 'blank' ? '상태 없음' : `알 수 없는 상태값: "${rawStatus}"`,
        rawName,
        rawStatus,
      })
      return
    }

    players.push({ id: rowIndex, name: rawName.normalize('NFC'), status: status.value })
  })

  return { players, issues }
}
