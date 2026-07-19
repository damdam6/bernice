// 기록 입력 · 날짜 선택(#67) — docs/prd-design.html §05 · docs/prd-record-input.html §05:
// 회차 카드 리스트(최신부터) — 날짜 + n차 라벨 + 완료 n/N. n차 라벨 파생 규칙(§09):
// sessions 날짜 오름차순 인덱스+1, 표기 "1차 · 2025-05-16".
import { useNavigate } from 'react-router-dom'
import type { RecordsResponse, Session } from '../../../shared/domain'
import { CenteredPanel } from '../../components/common/CenteredPanel'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'
import { useRecords } from '../../hooks/useRecords'
import { countCompleted } from '../../lib/entry-status'

export default function RecordsDateSelect() {
  const navigate = useNavigate()
  const { data, isError, error, refetch } = useRecords()

  if (isError) {
    return (
      <CenteredPanel>
        <ErrorPanel message={error?.message ?? '알 수 없는 오류가 발생했습니다'} onRetry={() => refetch()} />
      </CenteredPanel>
    )
  }

  if (!data) {
    return (
      <CenteredPanel>
        <Spinner label="회차 불러오는 중…" />
      </CenteredPanel>
    )
  }

  if (data.sessions.length === 0) {
    return (
      <CenteredPanel>
        <EmptyState title="아직 생성된 회차가 없습니다" description="먼저 기록지를 만들어야 참가자를 입력할 수 있어요">
          <button
            type="button"
            onClick={() => navigate('/admin/create-sheet')}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
          >
            기록지 만들기
          </button>
        </EmptyState>
      </CenteredPanel>
    )
  }

  return <DateSelectContent data={data} onSelect={(date) => navigate(`/admin/records/${date}`)} />
}

interface SessionRow {
  session: Session
  roundLabel: number
  completed: number
  total: number
}

function DateSelectContent({ data, onSelect }: { data: RecordsResponse; onSelect: (date: string) => void }) {
  const { sessions, events } = data

  // sessions는 날짜 오름차순이 계약(shared/domain.ts) — n차 라벨은 그 순서의 인덱스+1이므로
  // 먼저 오름차순 그대로 라벨을 매긴 뒤, 표시만 최신부터 뒤집는다.
  const rows: SessionRow[] = sessions
    .map((session, index) => ({
      session,
      roundLabel: index + 1,
      completed: countCompleted(session.entries, events),
      total: session.entries.length,
    }))
    .slice()
    .reverse()

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold tracking-tight text-ink">날짜 선택</h1>

      <div className="flex flex-col gap-2">
        {rows.map(({ session, roundLabel, completed, total }) => (
          <button
            key={session.date}
            type="button"
            onClick={() => onSelect(session.date)}
            className="flex w-full items-center justify-between rounded-card border border-line bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-primary"
          >
            <span className="text-sm font-bold text-ink">
              {roundLabel}차 <span className="font-normal text-ink-sub">· {session.date}</span>
            </span>
            <span
              className={`text-sm font-semibold ${completed === total && total > 0 ? 'text-good-strong' : 'text-ink-sub'}`}
            >
              완료 {completed}/{total}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
