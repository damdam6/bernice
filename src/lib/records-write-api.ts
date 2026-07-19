// POST /api/admin/records 호출을 감싼다 — docs/prd-record-input.html §06 계약(200 성공 ·
// 400 validation_failed · 404 session_not_found/not_participant · 502 sheets_api_error).
// 호출부(RecordsPlayerInput)는 error 코드를 그대로 message로 보여준다 — 코드별 문구를 새로
// 만들지 않고 서버가 이미 사람이 읽을 수 있게 준 message를 신뢰한다. 429·5xx 재시도는 서버
// (functions/lib/sheetsWriteApi.ts) 안에서 끝나므로 여기서는 한 번만 호출한다.
import type { EventScore } from '../../shared/domain'

export interface SaveRecordSuccess {
  ok: true
  sessionDate: string
  playerId: number
  name: string
  scores: Record<string, EventScore>
}

export interface SaveRecordFailure {
  ok: false
  error: string
  message: string
}

export type SaveRecordResult = SaveRecordSuccess | SaveRecordFailure

export async function saveRecord(
  sessionDate: string,
  playerId: number,
  scores: Record<string, string>,
): Promise<SaveRecordResult> {
  // fetch()는 HTTP 오류 상태(4xx/5xx)에는 정상 resolve하지만 네트워크 자체가 끊기면 reject한다
  // (useRecords.ts의 fetchRecords와 동일한 이유) — 이 함수의 타입 계약(Promise<SaveRecordResult>,
  // 항상 ok:true|false로 resolve)을 지키려면 여기서 잡아 SaveRecordFailure로 바꿔야 한다.
  // 호출부(RecordsPlayerInput)는 이 계약을 믿고 try/catch 없이 결과만 분기한다.
  let res: Response
  try {
    res = await fetch('/api/admin/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDate, playerId, scores }),
    })
  } catch {
    return {
      ok: false,
      error: 'network_error',
      message: '네트워크 오류로 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
    }
  }

  const body = (await res.json().catch(() => null)) as
    | {
        sessionDate?: string
        playerId?: number
        name?: string
        scores?: Record<string, EventScore>
        error?: string
        message?: string
      }
    | null

  if (res.ok) {
    return {
      ok: true,
      sessionDate: body?.sessionDate ?? sessionDate,
      playerId: body?.playerId ?? playerId,
      name: body?.name ?? '',
      scores: body?.scores ?? {},
    }
  }

  return {
    ok: false,
    error: body?.error ?? 'unknown_error',
    message: body?.message ?? '저장에 실패했어요. 다시 시도해주세요.',
  }
}
