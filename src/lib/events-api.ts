import { isPlainObject } from '../../shared/is-plain-object'
export async function saveEvent(command: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })
    if (res.ok) return { ok: true }
    const body: unknown = await res.json().catch(() => null)
    return { ok: false, message: isPlainObject(body) && typeof body.message === 'string' ? body.message : '저장하지 못했어요. 데이터 새로 고침 후 확인해주세요.' }
  } catch { return { ok: false, message: '연결이 끊겨 저장 결과를 확인할 수 없어요. 데이터 새로 고침으로 확인한 뒤 다시 시도해주세요.' } }
}
