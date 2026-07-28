import { describe, expect, it } from 'vitest'
import { parseGoals } from './parse-goals'

// docs/sheet-integration.html §02 예시 + docs/prd-event-lifecycle.html §04(5열 스키마)를 픽스처로 사용.
// 기존 행들은 일부러 E열(종료 회차)을 안 채운 4칸 그대로 둔다 — Sheets API가 각 행의 trailing 빈
// 셀을 생략해 돌려주는 실제 동작을 재현하며, row[4] ?? ''가 이를 "현역(null)"으로 처리함을 검증한다.
// 5열 HEADER 픽스처는 #159 이후에도 그대로 둔다 — F1 없는 과도기 시트가 전 종목
// exemptable=false로 수용되는 legacy 경로 회귀를 겸한다(F열 자체 검증은 아래 전용 describe).
const HEADER = ['종목', '목표', '만점', '방향', '종료 회차']
const HEADER6 = [...HEADER, '면제 가능']
const SAMPLE_ROWS = [
  HEADER,
  ['드리블셔틀런', '1:17', '-', '낮을수록'],
  ['골밑슛', '5', '10', '높을수록'],
  ['자유투', '2', '5', '높을수록'],
  ['45도패스캐치', '5', '7', '높을수록'],
]

describe('parseGoals', () => {
  it('문서 예시(양방향 · 시간형/개수형 목표치 · 만점 null/숫자 혼합)를 그대로 파싱한다', () => {
    expect(parseGoals(SAMPLE_ROWS).events).toEqual([
      { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록', endSessionDate: null, exemptable: false },
      { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록', endSessionDate: null, exemptable: false },
      { key: '자유투', valueKind: 'count', target: '2', targetValue: 2, maxScore: 5, direction: '높을수록', endSessionDate: null, exemptable: false },
      { key: '45도패스캐치', valueKind: 'count', target: '5', targetValue: 5, maxScore: 7, direction: '높을수록', endSessionDate: null, exemptable: false },
    ])
  })

  it('종목명이 NFD(자모 분해)로 들어와도 NFC로 정규화해 key에 반영한다', () => {
    const nameNFD = '드리블셔틀런'.normalize('NFD')
    expect(nameNFD).not.toBe('드리블셔틀런') // 픽스처가 실제로 다른 바이트 표현인지 확인

    const result = parseGoals([HEADER, [nameNFD, '1:17', '-', '낮을수록']])
    expect(result.events[0].key).toBe('드리블셔틀런')
  })

  it('만점이 빈 칸이어도 "-"와 동일하게 null로 처리한다', () => {
    const result = parseGoals([HEADER, ['드리블셔틀런', '1:17', '', '낮을수록']])
    expect(result.events[0].maxScore).toBeNull()
  })

  it('목표치 앞뒤 공백은 trim해서 target에 저장한다 (회차 파서의 표시값 정책과 동일)', () => {
    const result = parseGoals([HEADER, ['골밑슛', '  5  ', '10', '높을수록']])
    expect(result.events[0].target).toBe('5')
  })

  it('표 중간의 완전 공백 행은 에러 없이 건너뛴다', () => {
    const result = parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록'], ['', '', '', ''], ['자유투', '2', '5', '높을수록']])
    expect(result.events.map((event) => event.key)).toEqual(['골밑슛', '자유투'])
  })

  it('공백 행을 건너뛰어도 이후 행의 시트 행 번호가 밀리지 않는다 (회귀 테스트)', () => {
    // 헤더(1행)·골밑슛(2행)·공백(3행)·자유투(4행, 만점 오류) — 에러는 실제 시트 행인 4행을 가리켜야 한다.
    expect(() =>
      parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록'], ['', '', '', ''], ['자유투', '5', '다섯', '높을수록']]),
    ).toThrow(/4행 "자유투"/)
  })

  it('헤더만 있거나 빈 배열이면 빈 배열을 반환한다', () => {
    expect(parseGoals([HEADER]).events).toEqual([])
    expect(parseGoals([]).events).toEqual([])
  })

  describe('종료 회차(E열) 파싱 — V5', () => {
    it('빈칸이면 현역(null)', () => {
      const result = parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록', '']])
      expect(result.events[0].endSessionDate).toBeNull()
    })

    it('"-"이면 현역(null) — 만점 열과 동일 관례', () => {
      const result = parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록', '-']])
      expect(result.events[0].endSessionDate).toBeNull()
    })

    it('Sheets API가 행의 trailing 빈 셀을 생략해 4칸짜리 행이 와도 현역(null)으로 처리한다', () => {
      const result = parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록']])
      expect(result.events[0].endSessionDate).toBeNull()
    })

    it('실존하는 YYYY-MM-DD 날짜면 그대로 endSessionDate에 담는다', () => {
      const result = parseGoals([HEADER, ['45도패스캐치', '5', '7', '높을수록', '2025-05-16']])
      expect(result.events[0].endSessionDate).toBe('2025-05-16')
    })

    it('날짜 형식이 아니면 에러 (행 번호·종목명 포함)', () => {
      expect(() => parseGoals([HEADER, ['45도패스캐치', '5', '7', '높을수록', '2025/05/16']])).toThrow(
        /2행 "45도패스캐치".*종료 회차 형식이 올바르지 않음/,
      )
    })

    it('캘린더에 없는 날짜(2025-02-30)면 에러', () => {
      expect(() => parseGoals([HEADER, ['45도패스캐치', '5', '7', '높을수록', '2025-02-30']])).toThrow(
        /종료 회차 형식이 올바르지 않음/,
      )
    })
  })

  describe('면제 가능(F열) 파싱 — #159', () => {
    it("'가능'이면 true, 빈칸·'-'면 false (만점·종료 회차와 같은 없음 관례)", () => {
      const result = parseGoals([
        HEADER6,
        ['패스 - 체스트', '3', '5', '높을수록', '', '가능'],
        ['골밑슛', '5', '10', '높을수록', '', ''],
        ['자유투', '2', '5', '높을수록', '', '-'],
      ])
      expect(result.events.map((event) => event.exemptable)).toEqual([true, false, false])
    })

    it('Sheets API가 행의 trailing 빈 셀을 생략해 5칸 이하 행이 와도 false로 처리한다', () => {
      const result = parseGoals([HEADER6, ['골밑슛', '5', '10', '높을수록']])
      expect(result.events[0].exemptable).toBe(false)
    })

    it("'가능' 앞뒤 공백은 trim해서 인식한다", () => {
      const result = parseGoals([HEADER6, ['패스 - 체스트', '3', '5', '높을수록', '', ' 가능 ']])
      expect(result.events[0].exemptable).toBe(true)
    })

    it('허용 밖 값이면 에러 (행 번호·종목명 포함 fail-loud)', () => {
      expect(() => parseGoals([HEADER6, ['골밑슛', '5', '10', '높을수록', '', '불가']])).toThrow(
        /2행 "골밑슛".*면제 가능 값이 올바르지 않음/,
      )
    })

    it('F1 헤더가 예상("면제 가능")과 다르면 에러', () => {
      expect(() =>
        parseGoals([[...HEADER, '면제가능'], ['골밑슛', '5', '10', '높을수록', '', '가능']]),
      ).toThrow(/F1 헤더가 예상과 다릅니다/)
    })

    it('F1 헤더 없이(5열 스키마) F열 값만 있으면 에러 — 헤더 누락 실수를 조용히 무시하지 않는다', () => {
      expect(() => parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록', '', '가능']])).toThrow(
        /F1 헤더\("면제 가능"\)가 없음/,
      )
    })

    it('G열 이후는 헤더·값 모두 무시한다 — 미래 열 추가를 안전하게 만드는 관례 보존', () => {
      const result = parseGoals([
        [...HEADER6, '미래의 열'],
        ['패스 - 체스트', '3', '5', '높을수록', '', '가능', '아무 값'],
      ])
      expect(result.events[0].exemptable).toBe(true)
    })
  })

  describe('행 번호 동반 (sheetRowByKey) — create-sheet(#121)가 참조 수식에 쓸 내부 값, RecordsResponse에는 비노출', () => {
    it('각 종목 key에 목표 탭 실제 행 번호를 매핑한다', () => {
      const result = parseGoals(SAMPLE_ROWS)
      expect(Object.fromEntries(result.sheetRowByKey)).toEqual({
        드리블셔틀런: 2,
        골밑슛: 3,
        자유투: 4,
        '45도패스캐치': 5,
      })
    })

    it('중간에 완전 공백 행이 있어도 이후 종목의 행 번호가 밀리지 않는다', () => {
      const result = parseGoals([
        HEADER,
        ['골밑슛', '5', '10', '높을수록'],
        ['', '', '', ''],
        ['자유투', '2', '5', '높을수록'],
      ])
      expect(Object.fromEntries(result.sheetRowByKey)).toEqual({ 골밑슛: 2, 자유투: 4 })
    })
  })

  describe('잘못된 행 → 에러 (시트 행 번호·종목명을 담아 throw)', () => {
    it('종목명이 비어 있으면 에러', () => {
      expect(() => parseGoals([HEADER, ['', '5', '10', '높을수록']])).toThrow(/종목명이 비어 있음/)
    })

    it('목표치 형식이 잘못되면 에러 (문자 쓰레기값)', () => {
      expect(() => parseGoals([HEADER, ['골밑슛', 'abc', '10', '높을수록']])).toThrow(/목표치 형식이 올바르지 않음/)
    })

    it('목표치가 시간 범위를 벗어나면 에러 (60초 이상) — normalizeScore의 상세 사유를 그대로 포함한다', () => {
      expect(() => parseGoals([HEADER, ['드리블셔틀런', '1:75', '-', '낮을수록']])).toThrow(/초 값이 범위를 벗어남/)
    })

    it('h:mm:ss 형태(3파트) 목표치는 시트 자동 변환 의심 사유를 그대로 담아 에러', () => {
      expect(() => parseGoals([HEADER, ['드리블셔틀런', '1:15:00', '-', '낮을수록']])).toThrow(/자동/)
    })

    it('종목명이 중복되면 에러 (key가 하류 파서의 조인 키라 조용히 collapse되면 안 됨)', () => {
      expect(() =>
        parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록'], ['골밑슛', '6', '10', '높을수록']]),
      ).toThrow(/종목명이 중복됨/)
    })

    it('헤더가 예상(종목|목표|만점|방향|종료 회차)과 다르면 에러', () => {
      expect(() => parseGoals([['이름', '목표', '만점', '방향', '종료 회차'], ['골밑슛', '5', '10', '높을수록']])).toThrow(
        /헤더가 예상과 다릅니다/,
      )
    })

    it('4열 구 헤더(종료 회차 열 누락)는 에러 — 과도기 허용 없이 즉시 실패', () => {
      expect(() => parseGoals([['종목', '목표', '만점', '방향'], ['골밑슛', '5', '10', '높을수록']])).toThrow(
        /헤더가 예상과 다릅니다/,
      )
    })

    it('목표치가 빈 칸이면 에러 (설정 시트라 blank 허용 안 함)', () => {
      expect(() => parseGoals([HEADER, ['골밑슛', '', '10', '높을수록']])).toThrow(/목표치 형식이 올바르지 않음/)
    })

    it('만점 형식이 잘못되면 에러', () => {
      expect(() => parseGoals([HEADER, ['골밑슛', '5', '다섯', '높을수록']])).toThrow(/만점 형식이 올바르지 않음/)
    })

    it('방향 값이 목록(낮을수록/높을수록)에 없으면 에러', () => {
      expect(() => parseGoals([HEADER, ['골밑슛', '5', '10', '상관없음']])).toThrow(/방향 값이 올바르지 않음/)
    })

    it('에러 메시지에 시트 행 번호(헤더 다음 2행부터)와 종목명이 포함된다', () => {
      expect(() => parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록'], ['자유투', '5', '다섯', '높을수록']])).toThrow(
        /3행 "자유투"/,
      )
    })
  })
})
