import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6">
      <main className="w-full max-w-frame rounded-card border border-line bg-white p-10 text-center shadow-sm">
        <p className="text-5xl">🏀</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-sm text-ink-sub">주소를 다시 확인해 주세요</p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary-tint px-4 py-1.5 text-xs font-semibold text-primary-strong hover:bg-primary-soft"
        >
          홈으로 돌아가기
        </Link>
      </main>
    </div>
  )
}
