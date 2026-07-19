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
  // fetch()는 HTTP 오류 상태(4xx/5xx)에는 정상 resolve하지만 네트워크 자체가 끊기면 reject한다
  // (records-write-api.ts의 saveRecord와 동일한 이유) — 이 함수의 타입 계약(Promise<AddPlayersResult>,
  // 항상 ok:true|false로 resolve)을 지키려면 여기서 잡아 AddPlayersFailure로 바꿔야 한다.
  // 호출부(AddPlayers)는 이 계약을 믿고 try/catch 없이 결과만 분기한다.
  let res: Response
  try {
    res = await fetch('/api/admin/add-players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDate, playerIds }),
    })
  } catch {
    return {
      ok: false,
      error: 'network_error',
      message: '네트워크 오류로 추가하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
    }
  }

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
