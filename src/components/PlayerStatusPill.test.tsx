import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerStatusPill } from './PlayerStatusPill'
import { PLAYER_STATUSES } from '../../shared/domain'

function renderText(html: string): string {
  const match = html.match(/>([^<]*)</)
  if (!match) throw new Error(`텍스트를 찾을 수 없음: ${html}`)
  return match[1]
}

function renderClassName(html: string): string {
  const match = html.match(/class="([^"]*)"/)
  if (!match) throw new Error(`class 속성을 찾을 수 없음: ${html}`)
  return match[1]
}

describe('PlayerStatusPill', () => {
  it.each(PLAYER_STATUSES)('%s 상태 텍스트를 번역 없이 그대로 렌더한다', (status) => {
    expect(renderText(renderToStaticMarkup(<PlayerStatusPill status={status} />))).toBe(status)
  })

  it('상태 4종의 렌더 결과 클래스가 서로 다르다(색이 구분됨)', () => {
    const classes = PLAYER_STATUSES.map((status) =>
      renderClassName(renderToStaticMarkup(<PlayerStatusPill status={status} />)),
    )
    expect(new Set(classes).size).toBe(PLAYER_STATUSES.length)
  })
})
