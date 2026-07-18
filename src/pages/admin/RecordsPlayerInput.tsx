import { useParams } from 'react-router-dom'

export default function RecordsPlayerInput() {
  const { sessionDate, playerId } = useParams<{ sessionDate: string; playerId: string }>()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-brand-50 px-6">
      <main className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">선수별 입력</h1>
        <p className="mt-2 text-sm text-brand-700">
          회차 {sessionDate} · 선수 {playerId} 입력 화면은 #68에서 채워집니다
        </p>
      </main>
    </div>
  )
}
