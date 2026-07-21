import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { MobileFrame } from './MobileFrame'

export function MainLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <MobileFrame className="flex flex-1 flex-col pb-16">
        <Outlet />
      </MobileFrame>
      <BottomNav />
    </div>
  )
}
