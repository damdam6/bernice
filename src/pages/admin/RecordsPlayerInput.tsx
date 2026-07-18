import { useParams } from 'react-router-dom'

export default function RecordsPlayerInput() {
  const { sessionDate, playerId } = useParams<{ sessionDate: string; playerId: string }>()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6">
      <main className="w-full max-w-md rounded-card border border-line bg-white p-10 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-ink">선수별 입력</h1>
        <p className="mt-2 text-sm text-ink-sub">
          회차 {sessionDate} · 선수 {playerId} 입력 화면은 #68에서 채워집니다
        </p>
      </main>
    </div>
  )
}
