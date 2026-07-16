type AchievementBadgeProps = {
  achieved: boolean
}

export const ACHIEVEMENT_BADGE_STYLE: Record<'achieved' | 'notAchieved', string> = {
  achieved: 'bg-good/15 text-good',
  notAchieved: 'bg-slate-200 text-slate-600',
}

export function AchievementBadge({ achieved }: AchievementBadgeProps) {
  const style = ACHIEVEMENT_BADGE_STYLE[achieved ? 'achieved' : 'notAchieved']

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}
    >
      {achieved ? '달성' : '미달성'}
    </span>
  )
}
