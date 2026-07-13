import { describe, expect, it } from 'vitest'
import { classifySheetTabs } from './sheetTabs'

// Sheets API가 실제로 돌려줄 수 있는 NFD(자모 분해) 형태를 런타임에서 생성해 픽스처로 쓴다.
// 소스에 그대로 적은 '버니스명단'/'목표' 리터럴은 NFC(완성형)이므로, 두 형태는 서로 다른 문자열이다.
const ROSTER_NFD = '버니스명단'.normalize('NFD')
const GOALS_NFD = '목표'.normalize('NFD')

describe('classifySheetTabs', () => {
  it('빈 배열을 넣으면 전부 비어있는 결과를 돌려준다', () => {
    expect(classifySheetTabs([])).toEqual({ roster: null, goals: null, rounds: [], unclassified: [] })
  })

  it('NFC 입력에서 명단·목표 탭을 매칭한다', () => {
    const result = classifySheetTabs(['버니스명단', '목표', '2025-05-16'])
    expect(result.roster).toBe('버니스명단')
    expect(result.goals).toBe('목표')
  })

  it('NFD(자모 분해) 입력도 NFC 정규화 후 비교해 매칭하고, 원본 NFD 문자열을 그대로 돌려준다', () => {
    expect(ROSTER_NFD).not.toBe('버니스명단') // 픽스처가 실제로 다른 바이트 표현인지 확인
    expect(GOALS_NFD).not.toBe('목표')

    const result = classifySheetTabs([ROSTER_NFD, GOALS_NFD])
    expect(result.roster).toBe(ROSTER_NFD)
    expect(result.goals).toBe(GOALS_NFD)
  })

  it('회차 탭을 날짜 오름차순으로 정렬하고 마지막 원소로 최신 회차를 식별할 수 있다', () => {
    const result = classifySheetTabs(['2025-08-16', '버니스명단', '2025-02-14', '목표', '2025-05-16'])

    expect(result.rounds.map((r) => r.name)).toEqual(['2025-02-14', '2025-05-16', '2025-08-16'])
    expect(result.rounds.at(-1)?.name).toBe('2025-08-16')
    expect(result.rounds[0].date).toEqual(new Date(Date.UTC(2025, 1, 14)))
    expect(result.rounds.at(-1)?.date).toEqual(new Date(Date.UTC(2025, 7, 16)))
  })

  it('캘린더상 존재하지 않는 날짜는 회차로 분류하지 않고 unclassified에 노출한다', () => {
    const result = classifySheetTabs(['2025-13-01', '2025-02-30', '2025-05-16'])

    expect(result.rounds.map((r) => r.name)).toEqual(['2025-05-16'])
    expect(result.unclassified).toEqual(['2025-13-01', '2025-02-30'])
  })

  it('회차 명명 규칙을 벗어난 탭은 조용히 사라지지 않고 unclassified에 노출한다', () => {
    const result = classifySheetTabs(['3차', '8월', 'Sheet1', '2025-05-16'])

    expect(result.unclassified).toEqual(['3차', '8월', 'Sheet1'])
    expect(result.rounds.map((r) => r.name)).toEqual(['2025-05-16'])
  })

  it('명단/목표 탭 이름이 중복되면 첫 번째만 채택하고 나머지는 unclassified에 노출한다', () => {
    const result = classifySheetTabs(['버니스명단', '목표', ROSTER_NFD, GOALS_NFD])

    expect(result.roster).toBe('버니스명단')
    expect(result.goals).toBe('목표')
    expect(result.unclassified).toEqual([ROSTER_NFD, GOALS_NFD])
  })

  it('같은 날짜로 파싱되는 회차 탭이 바이트 표현만 다르게 둘 이상 존재하면 병합하지 않고 모두 남긴다', () => {
    // 이론상 Sheets가 탭 이름 유일성을 보장하지만, NFC/NFD처럼 바이트가 다른 두 탭이
    // 같은 날짜로 파싱될 가능성은 배제할 수 없다 — 우열을 가릴 근거가 없으므로 그대로 노출한다.
    const result = classifySheetTabs(['2025-05-16', '2025-05-16'])

    expect(result.rounds).toHaveLength(2)
    expect(result.unclassified).toEqual([])
  })
})
