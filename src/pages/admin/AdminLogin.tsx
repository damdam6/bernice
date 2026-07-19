// 관리자 로그인(#67) — docs/prd-design.html §05: 잠금 아이콘 블록 + "측정일 운영진 전용" 카피 +
// 코드 입력 + 오류 문구 + 로그인 버튼. 시각 패턴은 팀 열람 게이트(LoginGate의 PasscodeGate, #47)와
// 동일하고 카피만 다르다.
//
// POST /api/login은 관리자/팀 코드를 구분 없이 200으로 받아들이고 role만 다르게 준다(오라클 방지,
// functions/api/login.ts). 그래서 role !== 'admin'이면(유효한 팀 패스코드라도) 이 화면에선 실패로
// 취급한다 — 코드 자체는 맞아도 관리자 권한은 아니므로 시트 관리로 넘어가지 않는다.
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { RECORDS_QUERY_KEY } from '../../hooks/useRecords'
import { loginWithPasscode } from '../../lib/login-api'

export default function AdminLogin() {
  const navigate = useNavigate()
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
      if (!result.ok || result.role !== 'admin') {
        setError('관리자 코드가 올바르지 않습니다.')
        return
      }

      await queryClient.invalidateQueries({ queryKey: RECORDS_QUERY_KEY, exact: true })
      navigate('/admin', { replace: true })
    } catch {
      setError('네트워크 오류로 로그인에 실패했어요. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <main className="w-full max-w-md rounded-card border border-line bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-tint">
          <Lock className="size-7 text-primary" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">관리자 로그인</h1>
        <p className="mt-2 text-sm text-ink-sub">측정일 운영진 전용</p>

        <form onSubmit={handleSubmit} className="mt-8 text-left">
          <label htmlFor="admin-code" className="sr-only">
            관리자 코드
          </label>
          <input
            id="admin-code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="관리자 코드"
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
            {submitting ? '확인 중…' : '로그인'}
          </button>
        </form>
      </main>
    </div>
  )
}
