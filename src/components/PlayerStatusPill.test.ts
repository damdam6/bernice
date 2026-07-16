import { describe, expect, it } from 'vitest'
import { PLAYER_STATUS_PILL_STYLE } from './PlayerStatusPill'
import { PLAYER_STATUSES } from '../../shared/domain'

describe('PLAYER_STATUS_PILL_STYLE', () => {
  it('상태 4종 모두 스타일이 정의되어 있다', () => {
    for (const status of PLAYER_STATUSES) {
      expect(PLAYER_STATUS_PILL_STYLE[status]).toBeTruthy()
    }
  })

  it('상태 4종의 스타일이 서로 다르다(색이 구분됨)', () => {
    const values = PLAYER_STATUSES.map((status) => PLAYER_STATUS_PILL_STYLE[status])
    expect(new Set(values).size).toBe(PLAYER_STATUSES.length)
  })
})
