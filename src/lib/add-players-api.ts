// POST /api/admin/add-players 호출을 감싼다 — docs/prd-record-input.html §06 계약(200 성공 ·
// 404 session_not_found · 409 already_participant · 400 validation_failed · 502 sheets_api_error).
import { isPlainObject } from '../../shared/is-plain-object'

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

  // 필드 단위 검증 추출(#93) — 2xx인데 바디가 깨진 경우 서버 쓰기는 이미 성공한 상태라 실패로
  // 바꾸지 않고 기본값으로 폴백한다(실패 표시로 재시도를 유도하면 409 already_participant 충돌).
  const body: unknown = await res.json().catch(() => null)
  const fields: Record<string, unknown> = isPlainObject(body) ? body : {}

  if (res.ok) {
    return {
      ok: true,
      sessionDate: typeof fields.sessionDate === 'string' ? fields.sessionDate : sessionDate,
      added: parseAddedPlayers(fields.added) ?? [],
    }
  }

  return {
    ok: false,
    error: typeof fields.error === 'string' ? fields.error : 'unknown_error',
    message:
      typeof fields.message === 'string' ? fields.message : '참가자 추가에 실패했어요. 다시 시도해주세요.',
  }
}

// 토스트 인원수(added.length)가 계약 위반 원소를 세지 않도록, 하나라도 어긋나면 배열 전체를
// 버리고 기본값 폴백에 맡긴다 — 부분 성공을 조용히 섞지 않는다.
function parseAddedPlayers(raw: unknown): AddedPlayer[] | null {
  if (!Array.isArray(raw)) return null
  // Array.isArray는 any[]로 좁히므로 unknown[]으로 되넓혀 원소 접근을 검증 없이는 못 하게 한다.
  const list: unknown[] = raw
  const players: AddedPlayer[] = []
  for (const item of list) {
    if (!isPlainObject(item)) return null
    if (typeof item.playerId !== 'number' || typeof item.name !== 'string') return null
    players.push({ playerId: item.playerId, name: item.name })
  }
  return players
}
