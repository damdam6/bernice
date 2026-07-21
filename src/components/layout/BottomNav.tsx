import { Home, Trophy, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'
import { MobileFrame } from './MobileFrame'

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
  // fixed 셸은 위치만 잡는 투명 레이어 — 실제 바(border·bg·safe-area·탭)는 MobileFrame로
  // 감싸 프레임 폭에 중앙정렬한다(전폭 아님, #107). 넓은 화면에서 콘텐츠 컬럼과 정렬된다.
  return (
    <div className="fixed inset-x-0 bottom-0 z-10">
      <MobileFrame>
        <nav className="flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
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
      </MobileFrame>
    </div>
  )
}
