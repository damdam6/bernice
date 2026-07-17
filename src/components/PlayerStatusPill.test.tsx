import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerStatusPill } from './PlayerStatusPill'
import { PLAYER_STATUSES } from '../../shared/domain'
import { renderClassName, renderText } from '../test/html-utils'

describe('PlayerStatusPill', () => {
  it.each(PLAYER_STATUSES)('%s 상태 텍스트를 번역 없이 그대로 렌더한다', (status) => {
    expect(renderText(renderToStaticMarkup(<PlayerStatusPill status={status} />))).toBe(status)
  })

  it(`상태 ${PLAYER_STATUSES.length}종의 렌더 결과 클래스가 서로 다르다(색이 구분됨)`, () => {
    const classes = PLAYER_STATUSES.map((status) =>
      renderClassName(renderToStaticMarkup(<PlayerStatusPill status={status} />)),
    )
    expect(new Set(classes).size).toBe(PLAYER_STATUSES.length)
  })
})
