import { describe, expect, it } from 'vitest'
import type { Player } from '../../shared/domain'
import { AddPlayersError, buildAddPlayersPlan } from './add-players'

const ROSTER_NAME = '버니스명단'

const PLAYERS: Player[] = [
  { id: 1, name: '선수1', status: '활동' },
  { id: 2, name: '선수2', status: '활동' },
  { id: 3, name: '선수3', status: '활동' },
  { id: 4, name: '선수4', status: '탈퇴' },
  { id: 5, name: '선수5', status: '휴식' },
  { id: 6, name: '선수6', status: '비대상' },
  { id: 7, name: '선수7', status: '활동' },
]

const ROUND_HEADER = ['이름', '골밑슛', '자유투']

// 회차 탭 = 헤더 + 참가자 행(이름 + 임의 점수). 여기선 점수를 비워 둔다(A열만 판정에 쓰임).
function round(...participantNames: string[]): string[][] {
  return [ROUND_HEADER, ...participantNames.map((name) => [name, '', ''])]
}

describe('buildAddPlayersPlan', () => {
  it('활동 선수를 맨 아래 행에 이름 참조 수식으로 조립한다 (id 오름차순)', () => {
    const plan = buildAddPlayersPlan({
      rosterName: ROSTER_NAME,
      players: PLAYERS,
      roundValues: round('선수1'), // 선수1이 2행 → 다음은 3행
      playerIds: [3, 2], // 입력 순서와 무관하게 오름차순으로
    })

    expect(plan.startRow).toBe(3)
    expect(plan.rows).toEqual([["='버니스명단'!A3"], ["='버니스명단'!A4"]]) // id 2 → A3, id 3 → A4 (행 = id+1)
    expect(plan.added).toEqual([
      { playerId: 2, name: '선수2' },
      { playerId: 3, name: '선수3' },
    ])
  })

  it('헤더만 있는 회차 탭이면 startRow=2부터 추가한다', () => {
    const plan = buildAddPlayersPlan({
      rosterName: ROSTER_NAME,
      players: PLAYERS,
      roundValues: round(), // 헤더만
      playerIds: [7],
    })

    expect(plan.startRow).toBe(2)
    expect(plan.rows).toEqual([["='버니스명단'!A8"]]) // id 7 → A8
  })

  it('트레일링 빈 행은 트림하고 마지막 비공백 다음 행을 startRow로 쓴다', () => {
    const plan = buildAddPlayersPlan({
      rosterName: ROSTER_NAME,
      players: PLAYERS,
      roundValues: [ROUND_HEADER, ['선수1', '5', ''], ['', '', ''], ['', '', '']],
      playerIds: [2],
    })

    expect(plan.startRow).toBe(3) // 선수1이 2행, 뒤 빈 두 행은 무시
  })

  it('이미 그 회차에 있는 선수가 섞이면 already_participant로 거부하고 충돌 id를 모은다', () => {
    let thrown: unknown
    try {
      buildAddPlayersPlan({
        rosterName: ROSTER_NAME,
        players: PLAYERS,
        roundValues: round('선수1', '선수2'),
        playerIds: [1, 2, 3], // 1·2는 이미 있음
      })
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(AddPlayersError)
    expect((thrown as AddPlayersError).code).toBe('already_participant')
    expect((thrown as AddPlayersError).conflictPlayerIds).toEqual([1, 2])
  })

  it('탈퇴·휴식·비대상 등 비활동 선수는 validation_failed', () => {
    for (const inactiveId of [4, 5, 6]) {
      expect(() =>
        buildAddPlayersPlan({
          rosterName: ROSTER_NAME,
          players: PLAYERS,
          roundValues: round(),
          playerIds: [inactiveId],
        }),
      ).toThrowError(/활동 상태가 아닌/)
    }
  })

  it('명단에 없는 id는 validation_failed', () => {
    expect(() =>
      buildAddPlayersPlan({
        rosterName: ROSTER_NAME,
        players: PLAYERS,
        roundValues: round(),
        playerIds: [99],
      }),
    ).toThrowError(/명단에 없는 선수 id/)
  })

  it('빈 playerIds는 validation_failed', () => {
    expect(() =>
      buildAddPlayersPlan({ rosterName: ROSTER_NAME, players: PLAYERS, roundValues: round(), playerIds: [] }),
    ).toThrowError(AddPlayersError)
  })

  it('중복 id는 validation_failed', () => {
    expect(() =>
      buildAddPlayersPlan({ rosterName: ROSTER_NAME, players: PLAYERS, roundValues: round(), playerIds: [2, 2] }),
    ).toThrowError(/중복된 선수 id/)
  })

  it('정수 아님·0·음수 id는 validation_failed', () => {
    for (const badId of [2.5, 0, -1]) {
      expect(() =>
        buildAddPlayersPlan({ rosterName: ROSTER_NAME, players: PLAYERS, roundValues: round(), playerIds: [badId] }),
      ).toThrowError(/1 이상의 정수/)
    }
  })

  it('명단 탭 이름의 작은따옴표는 수식에서 이스케이프된다', () => {
    const plan = buildAddPlayersPlan({
      rosterName: "명단'A",
      players: PLAYERS,
      roundValues: round(),
      playerIds: [1],
    })

    expect(plan.rows).toEqual([["='명단''A'!A2"]]) // id 1 → A2, ' → ''
  })
})
