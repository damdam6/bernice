import { describe, expect, it } from 'vitest'
import { parseGoals } from './parse-goals'

// docs/sheet-integration.html §02 예시를 그대로 픽스처로 사용.
const HEADER = ['종목', '목표', '만점', '방향']
const SAMPLE_ROWS = [
  HEADER,
  ['드리블셔틀런', '1:17', '-', '낮을수록'],
  ['골밑슛', '5', '10', '높을수록'],
  ['자유투', '2', '5', '높을수록'],
  ['45도패스캐치', '5', '7', '높을수록'],
]

describe('parseGoals', () => {
  it('문서 예시(양방향 · 시간형/개수형 목표치 · 만점 null/숫자 혼합)를 그대로 파싱한다', () => {
    expect(parseGoals(SAMPLE_ROWS)).toEqual([
      { key: '드리블셔틀런', valueKind: 'time', target: '1:17', targetValue: 77, maxScore: null, direction: '낮을수록' },
      { key: '골밑슛', valueKind: 'count', target: '5', targetValue: 5, maxScore: 10, direction: '높을수록' },
      { key: '자유투', valueKind: 'count', target: '2', targetValue: 2, maxScore: 5, direction: '높을수록' },
      { key: '45도패스캐치', valueKind: 'count', target: '5', targetValue: 5, maxScore: 7, direction: '높을수록' },
    ])
  })

  it('종목명이 NFD(자모 분해)로 들어와도 NFC로 정규화해 key에 반영한다', () => {
    const nameNFD = '드리블셔틀런'.normalize('NFD')
    expect(nameNFD).not.toBe('드리블셔틀런') // 픽스처가 실제로 다른 바이트 표현인지 확인

    const result = parseGoals([HEADER, [nameNFD, '1:17', '-', '낮을수록']])
    expect(result[0].key).toBe('드리블셔틀런')
  })

  it('만점이 빈 칸이어도 "-"와 동일하게 null로 처리한다', () => {
    const result = parseGoals([HEADER, ['드리블셔틀런', '1:17', '', '낮을수록']])
    expect(result[0].maxScore).toBeNull()
  })

  it('표 중간의 완전 공백 행은 에러 없이 건너뛴다', () => {
    const result = parseGoals([HEADER, ['골밑슛', '5', '10', '높을수록'], ['', '', '', ''], ['자유투', '2', '5', '높을수록']])
    expect(result.map((event) => event.key)).toEqual(['골밑슛', '자유투'])
  })

  it('헤더만 있거나 빈 배열이면 빈 배열을 반환한다', () => {
    expect(parseGoals([HEADER])).toEqual([])
    expect(parseGoals([])).toEqual([])
  })

  describe('잘못된 행 → 에러 (시트 행 번호·종목명을 담아 throw)', () => {
    it('종목명이 비어 있으면 에러', () => {
      expect(() => parseGoals([HEADER, ['', '5', '10', '높을수록']])).toThrow(/종목명이 비어 있음/)
    })

    it('목표치 형식이 잘못되면 에러 (문자 쓰레기값)', () => {
      expect(() => parseGoals([HEADER, ['골밑슛', 'abc', '10', '높을수록']])).toThrow(/목표치 형식이 올바르지 않음/)
    })

    it('목표치가 시간 범위를 벗어나면 에러 (60초 이상)', () => {
      expect(() => parseGoals([HEADER, ['드리블셔틀런', '1:75', '-', '낮을수록']])).toThrow(/목표치 형식이 올바르지 않음/)
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
