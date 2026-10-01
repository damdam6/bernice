import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRecords } from '../../hooks/useRecords'
import { useSubmitMutation } from '../../hooks/useSubmitMutation'
import { useRefreshRecords } from '../../hooks/useRefreshRecords'
import { registerPlayer } from '../../lib/register-player-api'
import { compareKorean } from '../../lib/korean-sort'
import { Card } from '../../components/Card'
import { PlayerStatusPill } from '../../components/PlayerStatusPill'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'

export default function RosterManagement() {
  const { data, isError, error, refetch } = useRecords()
  const { submitting, submitError, submit, clearError } = useSubmitMutation()
  const { refreshing, refresh } = useRefreshRecords()
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const pending = useRef(false)

  async function register(event: React.FormEvent) {
    event.preventDefault()
    if (pending.current || !name.trim()) return
    pending.current = true
    setNotice('')
    try {
      await submit(() => registerPlayer(name), () => {
        setName('')
        setNotice('팀원을 등록했어요. 참가할 회차는 참가자 추가에서 선택해주세요.')
      })
    } finally { pending.current = false }
  }

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-ink">전체 팀원 관리</h1>
        <p className="mt-2 text-sm text-ink-sub">전체 명단에 팀원을 등록해요. 회차에는 자동으로 참가하지 않아요.</p>
      </header>
      <Card>
        <form onSubmit={register} className="flex flex-col gap-3">
          <label htmlFor="member-name" className="text-sm font-semibold text-ink">새 팀원 이름</label>
          <input id="member-name" value={name} required maxLength={100} disabled={submitting} onChange={(event) => { setName(event.target.value); clearError(); setNotice('') }} placeholder="이름을 입력해주세요" className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink" aria-describedby="member-name-help" />
          <p id="member-name-help" className="text-xs text-ink-sub">동명이인은 구분 가능한 이름으로 등록해주세요. 신규 팀원은 활동 상태로 등록돼요.</p>
          {submitError && <p role="alert" className="text-sm text-bad">{submitError}</p>}
          <button disabled={!name.trim() || submitting || !data || isError} className="rounded-[13px] bg-primary py-3.5 text-sm font-bold text-white disabled:opacity-50">{submitting ? '등록하는 중…' : '팀원 등록'}</button>
        </form>
      </Card>
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <Link to="/admin/add-players" className="text-sm font-semibold text-primary">회차별 참가자 추가 →</Link>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">전체 팀원 {data ? `${data.players.length}명` : ''}</h2>
        <button type="button" disabled={refreshing || submitting} onClick={async () => { setRefreshError(''); const result = await refresh(); if (!result.ok) setRefreshError(result.message) }} className="text-sm text-ink-sub disabled:opacity-50">{refreshing ? '새로 고침 중…' : '명단 새로 고침'}</button>
      </div>
      {refreshError && <p role="alert" className="text-sm text-bad">{refreshError}</p>}
      {isError ? <ErrorPanel message={error?.message ?? '명단을 불러오지 못했어요'} onRetry={() => refetch()} /> : !data ? <Spinner label="명단 불러오는 중…" /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {[...data.players].sort(compareKorean).map((player) => <li key={player.id} className="flex items-center justify-between px-4 py-3"><span className="text-sm font-semibold text-ink">{player.name}</span><PlayerStatusPill status={player.status} /></li>)}
          {data.players.length === 0 && <li className="p-4 text-sm text-ink-sub">등록된 팀원이 없습니다.</li>}
        </ul>
      )}
    </div>
  )
}
