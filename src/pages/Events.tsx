import { useState } from 'react'
import { Link } from 'react-router-dom'
import { allEventTags, filterEventsByTag } from '../../shared/event-tags'
import { eventLabel } from '../../shared/event-identity'
import { useRecords } from '../hooks/useRecords'
export default function Events() {
  const { data, isError, refetch } = useRecords()
  const [tag, setTag] = useState<string | null>(null)
  if (isError) return <div role="alert">종목을 불러오지 못했어요. <button onClick={() => refetch()}>다시 시도</button></div>
  if (!data) return <p role="status">종목 불러오는 중…</p>
  const tags = allEventTags(data.events)
  const groups = tag === null ? [...tags, ''] : [tag]
  const visible = filterEventsByTag(data.events, tag)
  return <div className="flex flex-col gap-4 px-4 py-6">
    <Link to="/rankings" className="text-primary">← 랭킹</Link>
    <h1 className="text-xl font-bold">태그별 종목</h1>
    <p className="text-sm text-ink-sub">종료된 종목도 함께 표시해요. 여러 태그가 붙은 종목은 각 그룹에 표시돼요.</p>
    <label>태그 필터<select aria-label="태그 필터" value={tag === null ? 'all' : `tag:${tag}`} onChange={(e) => setTag(e.target.value === 'all' ? null : e.target.value.slice(4))} className="ml-2 rounded-lg border border-line bg-white p-2">
      <option value="all">전체</option><option value="tag:">태그 없음</option>
      {tags.map((t) => <option key={t} value={`tag:${t}`}>{t}</option>)}
    </select></label>
    {visible.length === 0 && <p role="status">해당 태그의 종목이 없어요.</p>}
    {groups.map((group) => {
      const members = filterEventsByTag(visible, group)
      return members.length > 0 && <section key={group} className="flex flex-col gap-2">
        <h2 className="font-bold">{group || '태그 없음'}</h2>
        {members.map((event) => <article key={event.id} className="rounded-card border border-line bg-white p-4">
          <h3 className="font-semibold">{eventLabel(event, data.events, data.sessions)}</h3>
          <p className="text-sm">목표 {event.target}{event.maxScore !== null ? ` / ${event.maxScore}` : ''} · {event.direction}</p>
          <p className="text-sm text-ink-sub">{event.endSessionDate ? `종료 · ${event.endSessionDate}` : '진행 중'}</p>
        </article>)}
      </section>
    })}
  </div>
}
