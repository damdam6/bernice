import { expect, it } from 'vitest'
import { filterEventsByTag, normalizeEventTags, tagsFromCell } from './event-tags'
import { parseGoals } from '../functions/lib/parse-goals'
const headers = ['종목', '목표', '만점', '방향', '종료 회차', '면제 가능', '종목 ID', '', '태그']
it('공백과 중복을 제거하고 빈 태그를 허용한다', () => {
  expect(tagsFromCell(' 패스,기본기, 패스, ')).toEqual(['패스', '기본기'])
  expect(tagsFromCell('')).toEqual([])
})
it.each([['a,b'], ['a\nb'], [2], Array(11).fill('a'), ['a'.repeat(31)], '패스'])('잘못된 태그를 거절한다: %j', (raw) => {
  expect(() => normalizeEventTags(raw)).toThrow()
})
it('태그가 같아도 동명/종료 ID별로 분리한다', () => {
  const { events } = parseGoals([headers, ['패스', '3', '5', '높을수록', '2025-05-16', '', 'old', '', '패스'], ['패스', '4', '5', '높을수록', '', '', 'new', '', '패스'], ['슛', '7', '10', '높을수록', '', '', 'shot']])
  expect(filterEventsByTag(events, '패스').map((e) => e.id)).toEqual(['old', 'new'])
  expect(filterEventsByTag(events, '').map((e) => e.id)).toEqual(['shot'])
  expect(filterEventsByTag(events, '없음')).toEqual([])
  expect(filterEventsByTag(events, null)).toHaveLength(3)
})
it('헤더 누락이나 다른 I열 데이터는 덮어쓰지 않도록 실패한다', () => {
  expect(() => parseGoals([[...headers.slice(0, 8), '메모']])).toThrow()
  expect(() => parseGoals([headers.slice(0, 8), ['패스', '3', '5', '높을수록', '', '', 'old', '', '패스']])).toThrow('헤더')
})
