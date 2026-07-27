// POST /api/refresh 호출을 감싼다(#151) — records 엣지 캐시 퍼지(functions/api/refresh.ts, #43).
// add-players-api.ts와 같은 관용구로 네트워크 오류·비2xx도 항상 { ok } 유니온으로 resolve해,
// 호출부(useRefreshRecords)가 try/catch 없이 결과만 분기한다.
import { isPlainObject } from '../../shared/is-plain-object'

export interface RefreshCacheSuccess {
  ok: true
}

export interface RefreshCacheFailure {
  ok: false
  message: string
}

export type RefreshCacheResult = RefreshCacheSuccess | RefreshCacheFailure

export async function refreshRecordsCache(): Promise<RefreshCacheResult> {
  let res: Response
  try {
    res = await fetch('/api/refresh', { method: 'POST' })
  } catch {
    return {
      ok: false,
      message: '네트워크 오류로 새로 고침하지 못했어요. 연결을 확인하고 다시 시도해주세요.',
    }
  }

  if (res.ok) {
    // 성공 바디({ deleted })는 UI가 쓰지 않는다 — 읽지 않고 버리면 응답이 GC될 때까지
    // keep-alive 연결이 묶일 수 있어 명시적으로 취소한다(useRecords의 401 처리와 동일 관용구).
    await res.body?.cancel()
    return { ok: true }
  }

  const body: unknown = await res.json().catch(() => null)
  const message = isPlainObject(body) && typeof body.message === 'string' ? body.message : null
  return { ok: false, message: message ?? '캐시 비우기에 실패했어요. 다시 시도해주세요.' }
}
