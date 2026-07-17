import { useEffect, useState } from 'react'

type ApiStatus = 'loading' | 'ok' | 'down'

const STATUS_LABEL: Record<ApiStatus, string> = {
  loading: 'API 확인 중…',
  ok: 'API 정상',
  down: 'API 응답 없음',
}

const STATUS_DOT: Record<ApiStatus, string> = {
  loading: 'bg-warn',
  ok: 'bg-good',
  down: 'bg-bad',
}

export default function Home() {
  const [status, setStatus] = useState<ApiStatus>('loading')

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((data: { ok: boolean }) => setStatus(data.ok ? 'ok' : 'down'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('down')
      })

    return () => controller.abort()
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-brand-50 px-6">
      <main className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-10 text-center shadow-sm">
        <p className="text-5xl">🏀</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-brand-900">
          버니스 실력 기록
        </h1>
        <p className="mt-2 text-sm text-brand-700">팀 랭킹 · 개인 성장 추이</p>
        <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-1.5 text-xs font-semibold text-brand-800">
          <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
          {STATUS_LABEL[status]}
        </p>
      </main>
      <p className="mt-6 text-xs text-brand-400">P0 스캐폴딩 · 화면은 P3~P4에서 채워집니다</p>
    </div>
  )
}
