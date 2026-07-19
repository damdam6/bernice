import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntryStatusPill } from './EntryStatusPill'
import { ENTRY_STATUSES } from '../lib/entry-status'
import { renderClassName, renderText } from '../test/html-utils'

describe('EntryStatusPill', () => {
  it.each(ENTRY_STATUSES)('%s 상태 텍스트를 번역 없이 그대로 렌더한다', (status) => {
    expect(renderText(renderToStaticMarkup(<EntryStatusPill status={status} />))).toBe(status)
  })

  it(`상태 ${ENTRY_STATUSES.length}종의 렌더 결과 클래스가 서로 다르다(색이 구분됨)`, () => {
    const classes = ENTRY_STATUSES.map((status) =>
      renderClassName(renderToStaticMarkup(<EntryStatusPill status={status} />)),
    )
    expect(new Set(classes).size).toBe(ENTRY_STATUSES.length)
  })
})
