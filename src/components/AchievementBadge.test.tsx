import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AchievementBadge } from './AchievementBadge'

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

describe('AchievementBadge', () => {
  it('achieved=true면 "달성" 텍스트를 렌더한다', () => {
    expect(renderText(renderToStaticMarkup(<AchievementBadge achieved />))).toBe('달성')
  })

  it('achieved=false면 "미달성" 텍스트를 렌더한다', () => {
    expect(renderText(renderToStaticMarkup(<AchievementBadge achieved={false} />))).toBe(
      '미달성',
    )
  })

  it('달성/미달성 렌더 결과의 클래스가 서로 다르다(색이 구분됨)', () => {
    const achievedClass = renderClassName(renderToStaticMarkup(<AchievementBadge achieved />))
    const notAchievedClass = renderClassName(
      renderToStaticMarkup(<AchievementBadge achieved={false} />),
    )
    expect(achievedClass).not.toBe(notAchievedClass)
  })
})
