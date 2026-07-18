import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

export function MainLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <main className="flex flex-1 flex-col pb-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
