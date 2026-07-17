import { Pill } from './Pill'

type AchievementBadgeProps = {
  achieved: boolean
}

const ACHIEVEMENT_BADGE_STYLE: Record<'achieved' | 'notAchieved', string> = {
  achieved: 'bg-good/15 text-good',
  notAchieved: 'bg-slate-200 text-slate-600',
}

export function AchievementBadge({ achieved }: AchievementBadgeProps) {
  const style = ACHIEVEMENT_BADGE_STYLE[achieved ? 'achieved' : 'notAchieved']

  return <Pill colorClassName={style}>{achieved ? '달성' : '미달성'}</Pill>
}
