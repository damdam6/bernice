import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECORDS_CACHE_KEY } from '../lib/records-cache'

const { onRequestPost } = await import('./refresh')

function makeContext(deleteResult: boolean) {
  const deleteMock = vi.fn(async (_key: string) => deleteResult)
  vi.stubGlobal('caches', { default: { delete: deleteMock } })
  const context = {} as Parameters<typeof onRequestPost>[0]
  return { context, deleteMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('onRequestPost /api/refresh', () => {
  it('캐시에 항목이 있으면 삭제 후 200 + { deleted: true } 응답', async () => {
    const { context, deleteMock } = makeContext(true)

    const response = await onRequestPost(context)

    expect(response.status).toBe(200)
    expect(deleteMock).toHaveBeenCalledWith(RECORDS_CACHE_KEY)
    const body = (await response.json()) as { deleted: boolean }
    expect(body).toEqual({ deleted: true })
  })

  it('캐시가 비어 있으면 200 + { deleted: false } 응답 (에러 아님)', async () => {
    const { context, deleteMock } = makeContext(false)

    const response = await onRequestPost(context)

    expect(response.status).toBe(200)
    expect(deleteMock).toHaveBeenCalledWith(RECORDS_CACHE_KEY)
    const body = (await response.json()) as { deleted: boolean }
    expect(body).toEqual({ deleted: false })
  })
})
