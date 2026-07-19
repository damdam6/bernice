// POST /api/admin/add-players 호출을 감싼다 — docs/prd-record-input.html §06 계약(200 성공 ·
// 404 session_not_found · 409 already_participant · 400 validation_failed · 502 sheets_api_error).
export interface AddedPlayer {
  playerId: number
  name: string
}

export interface AddPlayersSuccess {
  ok: true
  sessionDate: string
  added: AddedPlayer[]
}

export interface AddPlayersFailure {
  ok: false
  error: string
  message: string
}

export type AddPlayersResult = AddPlayersSuccess | AddPlayersFailure

export async function addPlayers(sessionDate: string, playerIds: number[]): Promise<AddPlayersResult> {
  const res = await fetch('/api/admin/add-players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionDate, playerIds }),
  })

  const body = (await res.json().catch(() => null)) as
    | { sessionDate?: string; added?: AddedPlayer[]; error?: string; message?: string }
    | null

  if (res.ok) {
    return { ok: true, sessionDate: body?.sessionDate ?? sessionDate, added: body?.added ?? [] }
  }

  return {
    ok: false,
    error: body?.error ?? 'unknown_error',
    message: body?.message ?? '참가자 추가에 실패했어요. 다시 시도해주세요.',
  }
}
