// 타입 가드 — 검증 후 `as` 단언 없이 Record<string, unknown>로 좁힌다(배열·null은 객체에서 제외).
// functions/api/admin/records.ts의 parseBody 관용구(#86)에서 승격(#93) — 서버 바디 파싱과
// 프론트 응답 파싱이 같은 좁히기를 공유한다.
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
