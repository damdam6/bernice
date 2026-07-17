export function renderText(html: string): string {
  const match = html.match(/>([^<]*)</)
  if (!match) throw new Error(`텍스트를 찾을 수 없음: ${html}`)
  return match[1]
}

export function renderClassName(html: string): string {
  const match = html.match(/class="([^"]*)"/)
  if (!match) throw new Error(`class 속성을 찾을 수 없음: ${html}`)
  return match[1]
}
