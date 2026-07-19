// 가나다 정렬 비교자 — functions/lib/create-sheet.ts의 참가자 정렬 로직과 동일 규칙의 프론트
// 사본(tsconfig.app.json이 functions/를 include하지 않아 직접 import 불가, #67).
// 한글 완성형 음절(U+AC00–U+D7A3)은 유니코드 블록이 초성→중성→종성 = 가나다 순으로 배열돼 있어
// NFC 문자열의 코드유닛 비교가 곧 가나다 순이다. 동명이면 id 오름차순으로 결정성을 확보한다.
export function compareKorean<T extends { id: number; name: string }>(a: T, b: T): number {
  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return a.id - b.id
}
