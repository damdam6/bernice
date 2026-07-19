// 열람 게이트(#47) — 팀 패스코드로 홈/랭킹/개인 데이터 화면을 보호한다.
// 새 인증 확인 엔드포인트를 두지 않고, 이미 401을 구분해 던지는 useRecords(#46)를
// 그대로 인증 신호로 재사용한다: 쿼리 상태가 유일한 진실 공급원이라 별도 상태와
// 어긋날 일이 없다. 로그인 성공 시 같은 쿼리를 무효화·재조회시켜, URL 이동 없이
// 게이트가 자동으로 걷히고 원래 라우트로 복귀한다.
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { MainLayout } from '../layout/MainLayout'
import { Spinner } from '../common/Spinner'
import { ErrorPanel } from '../common/ErrorPanel'
import { RECORDS_QUERY_KEY, useRecords } from '../../hooks/useRecords'
import { UnauthorizedError } from '../../lib/api-error'
import { loginWithPasscode } from '../../lib/login-api'

export function LoginGate() {
  const { isPending, error, refetch } = useRecords()

  if (isPending) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas">
        <Spinner label="확인 중…" />
      </div>
    )
  }

  if (error instanceof UnauthorizedError) {
    return <PasscodeGate />
  }

  // 401이 아닌 다른 실패(네트워크·5xx 등)는 records가 홈/랭킹/개인 3탭이 공유하는
  // 단일 데이터 소스라 개별 페이지가 각자 처리할 수 없다 — 여기서 공통 에러 화면을 보여준다.
  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6">
        <ErrorPanel message={error.message} onRetry={() => refetch()} />
      </div>
    )
  }

  return <MainLayout />
}

function PasscodeGate() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const result = await loginWithPasscode(code)
      if (!result.ok) {
        setError(result.message ?? '패스코드가 올바르지 않습니다.')
        return
      }

      await queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY, exact: true })
    } catch {
      setError('네트워크 오류로 로그인에 실패했어요. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6">
      <main className="w-full max-w-md rounded-card border border-line bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-tint">
          <Lock className="size-7 text-primary" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">팀원 전용 열람</h1>
        <p className="mt-2 text-sm text-ink-sub">팀 패스코드를 입력하면 기록을 볼 수 있어요</p>

        <form onSubmit={handleSubmit} className="mt-8 text-left">
          <label htmlFor="team-passcode" className="sr-only">
            팀 패스코드
          </label>
          <input
            id="team-passcode"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="패스코드"
            className="w-full rounded-[13px] border border-input-line bg-input-bg px-4 py-3 text-center text-lg tracking-[0.3em] text-ink focus:border-primary focus:outline-none"
          />
          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-bad">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || code === ''}
            className="mt-6 w-full rounded-[13px] bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '확인 중…' : '입장하기'}
          </button>
        </form>
      </main>
    </div>
  )
}
