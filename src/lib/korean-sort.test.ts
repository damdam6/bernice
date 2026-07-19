import { describe, expect, it } from 'vitest'
import { compareKorean } from './korean-sort'

describe('compareKorean', () => {
  it('한글 이름을 가나다 순으로 정렬한다', () => {
    const items = [
      { id: 3, name: '다현' },
      { id: 1, name: '가은' },
      { id: 2, name: '나연' },
    ]

    expect(items.sort(compareKorean).map((i) => i.name)).toEqual(['가은', '나연', '다현'])
  })

  it('이름이 같으면 id 오름차순으로 정렬한다', () => {
    const items = [
      { id: 5, name: '선수' },
      { id: 2, name: '선수' },
      { id: 8, name: '선수' },
    ]

    expect(items.sort(compareKorean).map((i) => i.id)).toEqual([2, 5, 8])
  })
})
