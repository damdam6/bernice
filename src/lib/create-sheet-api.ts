// POST /api/admin/create-sheet 호출을 감싼다 — docs/prd-record-input.html §06 계약(201 성공 ·
// 409 sheet_already_exists · 400 no_participants/invalid_participants · 500 missing_*_tab ·
// 502 sheets_api_error). 호출부(CreateSheet)는 error 코드를 그대로 message로 보여준다 —
// 코드별 문구를 새로 만들지 않고 서버가 이미 사람이 읽을 수 있게 준 message를 신뢰한다.
import { isPlainObject } from '../../shared/is-plain-object'

export interface CreateSheetSuccess {
  ok: true
  sessionDate: string
  participantCount: number
}

export interface CreateSheetFailure {
  ok: false
  error: string
  message: string
}

export type CreateSheetResult = CreateSheetSuccess | CreateSheetFailure

export async function createSheet(participantIds: number[]): Promise<CreateSheetResult> {
  // fetch()는 HTTP 오류 상태(4xx/5xx)에는 정상 resolve하지만 네트워크 자체가 끊기면 reject한다
  // (records-write-api.ts의 saveRecord와 동일한 이유) — 이 함수의 타입 계약(Promise<CreateSheetResult>,
  // 항상 ok:true|false로 resolve)을 지키려면 여기서 잡아 CreateSheetFailure로 바꿔야 한다.
  // 호출부(CreateSheet)는 이 계약을 믿고 try/catch 없이 결과만 분기한다.
  let res: Response
  try {
    res = await fetch('/api/admin/create-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIds }),
    })
  } catch {
    return {
      ok: false,
      error: 'network_error',
      message: '네트워크 오류로 생성하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
    }
  }

  // 필드 단위 검증 추출(#93) — 2xx인데 바디가 깨진 경우 시트 생성은 이미 성공한 상태라 실패로
  // 바꾸지 않고 기본값으로 폴백한다(실패 표시로 재시도를 유도하면 409 sheet_already_exists 충돌).
  const body: unknown = await res.json().catch(() => null)
  const fields: Record<string, unknown> = isPlainObject(body) ? body : {}

  if (res.ok) {
    return {
      ok: true,
      sessionDate: typeof fields.sessionDate === 'string' ? fields.sessionDate : '',
      participantCount: typeof fields.participantCount === 'number' ? fields.participantCount : 0,
    }
  }

  return {
    ok: false,
    error: typeof fields.error === 'string' ? fields.error : 'unknown_error',
    message:
      typeof fields.message === 'string' ? fields.message : '기록지 생성에 실패했어요. 다시 시도해주세요.',
  }
}
