// 기록 입력 · 선수별 입력(#68) — docs/prd-design.html §05 · docs/prd-record-input.html §05:
// 종목 타입별 입력기(시간=분·초 2필드, 개수=스테퍼+직접입력, 면제=면제 가능 종목만 토글) +
// 기존 값 프리필 + 인라인 검증 + 하단 고정 저장 바. 검증은 buildEventScore(shared/)를 그대로
// 재사용해 서버와 동일한 규칙으로 판정한다(PRD §08 "검증 규칙의 원천은 하나").
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { EventDefinition, Session, SessionEntry } from '../../../shared/domain'
import { buildEventScore } from '../../../shared/build-event-score'
import { CenteredPanel } from '../../components/common/CenteredPanel'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorPanel } from '../../components/common/ErrorPanel'
import { Spinner } from '../../components/common/Spinner'
import { CountScoreInput } from '../../components/CountScoreInput'
import { ExemptToggle } from '../../components/ExemptToggle'
import { TimeScoreInput } from '../../components/TimeScoreInput'
import { useRecords } from '../../hooks/useRecords'
import { useSubmitMutation } from '../../hooks/useSubmitMutation'
import { isExemptable } from '../../lib/exemptable-events'
import { buildFieldRaw, initFieldState, initialFieldNotice, type FieldState } from '../../lib/player-input-field'
import { saveRecord } from '../../lib/records-write-api'

export default function RecordsPlayerInput() {
  const { sessionDate, playerId } = useParams<{ sessionDate: string; playerId: string }>()
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
        <Spinner label="기록 불러오는 중…" />
      </CenteredPanel>
    )
  }

  const session = data.sessions.find((candidate) => candidate.date === sessionDate)
  if (!session) {
    return (
      <CenteredPanel>
        <EmptyState title="회차를 찾을 수 없습니다" description={`${sessionDate} 회차 탭이 없어요`} />
      </CenteredPanel>
    )
  }

  const entry = session.entries.find((candidate) => candidate.playerId === Number(playerId))
  if (!entry) {
    return (
      <CenteredPanel>
        <EmptyState title="참가자를 찾을 수 없습니다" description="참가자 목록에서 다시 선택해주세요" />
      </CenteredPanel>
    )
  }

  const roundLabel = data.sessions.findIndex((candidate) => candidate.date === session.date) + 1

  return (
    <PlayerInputContent
      key={`${session.date}:${entry.playerId}`}
      session={session}
      entry={entry}
      events={data.events}
      roundLabel={roundLabel}
      onSaved={(toast) => navigate(`/admin/records/${session.date}`, { state: { toast } })}
    />
  )
}

function PlayerInputContent({
  session,
  entry,
  events,
  roundLabel,
  onSaved,
}: {
  session: Session
  entry: SessionEntry
  events: EventDefinition[]
  roundLabel: number
  onSaved: (toast: string) => void
}) {
  const [fields, setFields] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(events.map((event) => [event.key, initFieldState(event, entry.scores[event.key])])),
  )
  const { submitting, submitError, submit } = useSubmitMutation()

  function updateField(eventKey: string, next: FieldState) {
    setFields((prev) => ({ ...prev, [eventKey]: next }))
  }

  const scores = Object.fromEntries(
    events.map((event) => [event.key, buildEventScore(buildFieldRaw(fields[event.key]), event)]),
  )
  const hasInvalid = Object.values(scores).some((score) => score.status === 'invalid')

  async function handleSave() {
    const raw = Object.fromEntries(events.map((event) => [event.key, buildFieldRaw(fields[event.key])]))
    await submit(
      () => saveRecord(session.date, entry.playerId, raw),
      () => onSaved(`✓ ${entry.name} 저장됨 · 팀원 열람에 반영`),
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{entry.name}</h1>
        <p className="mt-1 text-sm text-ink-sub">
          {roundLabel}차 · {session.date}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {events.map((event) => {
          const field = fields[event.key]
          const score = scores[event.key]
          const notice = initialFieldNotice(event, entry.scores[event.key])
          const isBlank = buildFieldRaw(field) === ''

          return (
            <div key={event.key} className="rounded-card border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink">{event.key}</h2>
                {isExemptable(event.key) && (
                  <ExemptToggle
                    label={event.key}
                    checked={field.exempt}
                    onChange={(exempt) => updateField(event.key, { ...field, exempt })}
                  />
                )}
              </div>

              {!field.exempt && (
                <div className="mt-3">
                  {field.valueKind === 'time' ? (
                    <TimeScoreInput
                      label={event.key}
                      minutes={field.minutes}
                      seconds={field.seconds}
                      onChange={({ minutes, seconds }) => updateField(event.key, { ...field, minutes, seconds })}
                      error={score.status === 'invalid' ? score.reason : null}
                    />
                  ) : (
                    <CountScoreInput
                      label={event.key}
                      value={field.count}
                      maxScore={event.maxScore}
                      onChange={(count) => updateField(event.key, { ...field, count })}
                      error={score.status === 'invalid' ? score.reason : null}
                    />
                  )}
                </div>
              )}

              {notice && !field.exempt && isBlank && (
                <p className="mt-2 text-xs text-ink-sub">
                  기존 값 안내: "{notice.display}" — {notice.reason}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {submitError && (
        <p role="alert" className="text-center text-sm text-bad">
          {submitError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-canvas via-canvas px-4 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={submitting || hasInvalid}
          onClick={handleSave}
          className="w-full rounded-[13px] bg-primary py-3.5 text-sm font-bold text-white transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-neutral-strong disabled:opacity-60"
        >
          {submitting ? '저장하는 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}
