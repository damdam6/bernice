import { Home, Trophy, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'

interface NavTab {
  to: string
  end?: boolean
  label: string
  Icon: ComponentType<{ className?: string }>
}

const TABS: NavTab[] = [
  { to: '/', end: true, label: '홈', Icon: Home },
  { to: '/rankings', label: '랭킹', Icon: Trophy },
  { to: '/players', label: '개인', Icon: User },
]

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ to, end, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold ${
              isActive ? 'text-primary' : 'text-ink-muted'
            }`
          }
        >
          <Icon className="size-6" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
