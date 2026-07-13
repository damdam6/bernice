const EXEMPT_LITERAL = '면제'
const INTEGER_RE = /^\d+$/
const MAX_MINUTES = 999

export type ScoreValue =
  | { kind: 'count'; value: number; raw: string }
  | { kind: 'seconds'; value: number; raw: string }
  | { kind: 'exempt'; raw: string }
  | { kind: 'blank'; raw: string }
  | { kind: 'invalid'; raw: string; reason: string }

export function normalizeScore(raw: string | null | undefined): ScoreValue {
  if (raw == null) return { kind: 'blank', raw: '' }

  // NFKC: 전각 콜론(：)·전각 숫자(６) 같은 호환 문자를 반각으로 접어 정상 파싱되게 한다.
  // 한글 완성형 문자는 NFC와 결과가 같아 상태·면제 매칭에는 영향 없다.
  const trimmed = raw.trim().normalize('NFKC')
  if (trimmed === '') return { kind: 'blank', raw }
  if (trimmed === EXEMPT_LITERAL) return { kind: 'exempt', raw }

  return trimmed.includes(':') ? parseTime(trimmed, raw) : parseCount(trimmed, raw)
}

function parseTime(trimmed: string, raw: string): ScoreValue {
  const parts = trimmed.split(':')

  if (parts.length === 3 && parts.every((part) => INTEGER_RE.test(part))) {
    return {
      kind: 'invalid',
      raw,
      reason: '시간 형식이 mm:ss가 아니라 3파트(h:mm:ss) — 시트가 시각으로 자동 변환했을 가능성',
    }
  }
  if (parts.length !== 2 || !parts.every((part) => INTEGER_RE.test(part))) {
    return { kind: 'invalid', raw, reason: '시간 형식이 올바르지 않음 (mm:ss 형식이어야 함)' }
  }

  const [minutes, seconds] = parts.map(Number)
  if (minutes > MAX_MINUTES) {
    return { kind: 'invalid', raw, reason: `분 값이 비정상적으로 큼 (${MAX_MINUTES}분 초과)` }
  }
  if (seconds > 59) {
    return { kind: 'invalid', raw, reason: '초 값이 범위를 벗어남 (0-59)' }
  }

  return { kind: 'seconds', value: minutes * 60 + seconds, raw }
}

function parseCount(trimmed: string, raw: string): ScoreValue {
  if (!INTEGER_RE.test(trimmed)) {
    return { kind: 'invalid', raw, reason: '개수 값이 올바르지 않음 (0 이상의 정수여야 함)' }
  }

  return { kind: 'count', value: Number(trimmed), raw }
}
