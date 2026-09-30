import { useState } from 'react'
import { Link } from 'react-router-dom'
import { eventLabel } from '../../../shared/event-identity'
import { useRecords } from '../../hooks/useRecords'
import { useSubmitMutation } from '../../hooks/useSubmitMutation'
import { useRefreshRecords } from '../../hooks/useRefreshRecords'
import { saveEvent } from '../../lib/events-api'

const fieldClass = 'w-full rounded-lg border border-line bg-white p-3 text-ink'
const buttonClass = 'rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50'
export default function EventManagement() {
  const { data, isError, refetch } = useRecords()
  const { submit, submitting, submitError } = useSubmitMutation()
  const { refresh, refreshing } = useRefreshRecords()
  const [notice, setNotice] = useState('')
  const [kind, setKind] = useState('count')
  const [ending, setEnding] = useState<string | null>(null)
  if (isError) return <div role="alert">종목을 불러오지 못했어요. <button onClick={() => refetch()}>다시 시도</button></div>
  if (!data) return <p role="status">종목 불러오는 중…</p>
  return <div className="mx-auto flex w-full max-w-frame flex-col gap-6 px-4 py-6">
    <Link to="/admin" className="text-ink-sub">← 시트 관리</Link>
    <h1 className="text-xl font-bold">종목 관리</h1>
    <p className="text-sm text-ink-sub">기준이 바뀌면 기존 종목을 종료하고 새 종목으로 등록하세요. 과거 기록과 목표는 보존돼요.</p>
    <button disabled={submitting || refreshing} onClick={async () => { const r = await refresh(); setNotice(r.ok ? '최신 데이터를 불러왔어요.' : r.message) }} className={fieldClass}>데이터 새로 고침</button>
    {notice && <p role="status">{notice}</p>}
    {submitError && <p role="alert" className="text-bad">{submitError}</p>}
    <form className="flex flex-col gap-3 rounded-card border border-line bg-white p-4" onSubmit={async (e) => {
      e.preventDefault()
      const form = e.currentTarget
      const fields = new FormData(form)
      setNotice('')
      await submit(() => saveEvent({ action: 'create', name: fields.get('name'), target: fields.get('target'), valueKind: kind,
        maxScore: kind === 'time' || !fields.get('maxScore') ? null : Number(fields.get('maxScore')),
        direction: fields.get('direction'), exemptable: fields.get('exemptable') === 'yes' }), () => { form.reset(); setKind('count'); setNotice('새 종목을 등록했어요. 다음에 만드는 기록지부터 포함돼요.') })
    }}>
      <h2 className="font-bold">신규 종목 등록</h2>
      <fieldset disabled={submitting} className="flex flex-col gap-3">
        <label>이름<input required name="name" maxLength={100} className={fieldClass} /></label>
        <label>측정 형식<select value={kind} onChange={(e) => setKind(e.target.value)} className={fieldClass}><option value="count">개수</option><option value="time">시간</option></select></label>
        <label>목표<input required name="target" placeholder={kind === 'time' ? '1:15' : '3'} className={fieldClass} /></label>
        {kind === 'count' && <label>만점 (선택)<input name="maxScore" type="number" min="1" step="1" className={fieldClass} /></label>}
        <label>순위 방향<select name="direction" className={fieldClass}><option>높을수록</option><option>낮을수록</option></select></label>
        <label>면제 허용<select name="exemptable" required defaultValue="" className={fieldClass}><option value="" disabled>선택해주세요</option><option value="no">불가</option><option value="yes">가능</option></select></label>
        <button className={buttonClass} type="submit">{submitting ? '저장 중…' : '새 종목 등록'}</button>
      </fieldset>
    </form>
    <h2 className="font-bold">등록된 종목</h2>
    {data.events.length === 0 && <p>등록된 종목이 없어요.</p>}
    {data.events.map((event) => {
      const dates = data.sessions.filter((s) => s.eventIds.includes(event.id)).map((s) => s.date).sort()
      const last = dates.at(-1) ?? data.sessions.map((s) => s.date).sort().at(-1)
      return <section key={event.id} className="flex flex-col gap-2 rounded-card border border-line bg-white p-4">
        <h3 className="font-semibold">{eventLabel(event, data.events, data.sessions)}</h3>
        <p className="text-sm text-ink-sub">목표 {event.target}{event.maxScore !== null ? ` / ${event.maxScore}` : ''} · {event.direction} · 면제 {event.exemptable ? '가능' : '불가'}</p>
        <p className="text-sm">{event.endSessionDate ? `종료 · ${event.endSessionDate}` : '진행 중'} · {dates.length ? `${dates[0]} ~ ${dates.at(-1)}` : '측정 전'}</p>
        {event.endSessionDate === null && (ending === event.id ? <div className="flex flex-col gap-2">
          <p>{last} 회차로 종료할까요? 이후 만드는 기록지에서는 제외돼요.</p>
          <button disabled={submitting} className={buttonClass} onClick={() => submit(() => saveEvent({ action: 'end', id: event.id, endSessionDate: last }), () => { setEnding(null); setNotice('종목을 종료했어요. 과거 기록은 유지돼요.') })}>종료 확인</button>
          <button disabled={submitting} onClick={() => setEnding(null)}>취소</button>
        </div> : <button disabled={submitting || !last} className={fieldClass} onClick={() => setEnding(event.id)}>{last ? '종목 종료' : '회차 생성 후 종료 가능'}</button>)}
      </section>
    })}
  </div>
}
