import { Outlet } from 'react-router-dom'
import { BackButton } from './BackButton'

export function AdminLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-12 items-center px-4">
        <BackButton />
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
