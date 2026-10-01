import { isPlainObject } from '../../shared/is-plain-object'

export async function registerPlayer(name: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch('/api/admin/roster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    })
    if (response.ok) return { ok: true }
    const body: unknown = await response.json().catch(() => null)
    return { ok: false, message: isPlainObject(body) && typeof body.message === 'string' ? body.message : '등록하지 못했어요. 명단을 새로 고침한 뒤 다시 확인해주세요.' }
  } catch {
    return { ok: false, message: '연결이 끊겨 저장 결과를 확인할 수 없어요. 명단을 새로 고침해 반영 여부를 확인해주세요.' }
  }
}
