import { useParams } from 'react-router-dom'

export default function RecordsParticipants() {
  const { sessionDate } = useParams<{ sessionDate: string }>()

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <main className="w-full max-w-md rounded-card border border-line bg-white p-10 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-ink">참가자 목록</h1>
        <p className="mt-2 text-sm text-ink-sub">
          회차 {sessionDate} 참가자 목록 화면은 #67에서 채워집니다
        </p>
      </main>
    </div>
  )
}
