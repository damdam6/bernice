// POST /api/admin/create-sheet 호출을 감싼다 — docs/prd-record-input.html §06 계약(201 성공 ·
// 409 sheet_already_exists · 400 no_participants/invalid_participants · 500 missing_*_tab ·
// 502 sheets_api_error). 호출부(CreateSheet)는 error 코드를 그대로 message로 보여준다 —
// 코드별 문구를 새로 만들지 않고 서버가 이미 사람이 읽을 수 있게 준 message를 신뢰한다.
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
  const res = await fetch('/api/admin/create-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIds }),
  })

  const body = (await res.json().catch(() => null)) as
    | { sessionDate?: string; participantCount?: number; error?: string; message?: string }
    | null

  if (res.ok) {
    return { ok: true, sessionDate: body?.sessionDate ?? '', participantCount: body?.participantCount ?? 0 }
  }

  return {
    ok: false,
    error: body?.error ?? 'unknown_error',
    message: body?.message ?? '기록지 생성에 실패했어요. 다시 시도해주세요.',
  }
}
