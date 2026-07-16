import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_BADGE_STYLE } from './AchievementBadge'

describe('ACHIEVEMENT_BADGE_STYLE', () => {
  it('달성/미달성 스타일이 서로 다르다(색이 구분됨)', () => {
    expect(ACHIEVEMENT_BADGE_STYLE.achieved).not.toBe(ACHIEVEMENT_BADGE_STYLE.notAchieved)
  })
})
