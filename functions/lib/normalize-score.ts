const EXEMPT_LITERAL = '면제'
const INTEGER_RE = /^\d+$/

export type ScoreValue =
  | { kind: 'count'; value: number; raw: string }
  | { kind: 'seconds'; value: number; raw: string }
  | { kind: 'exempt'; raw: string }
  | { kind: 'blank' }
  | { kind: 'invalid'; raw: string; reason: string }

export function normalizeScore(raw: string | null | undefined): ScoreValue {
  if (raw == null) return { kind: 'blank' }

  const trimmed = raw.trim().normalize('NFC')
  if (trimmed === '') return { kind: 'blank' }
  if (trimmed === EXEMPT_LITERAL) return { kind: 'exempt', raw }

  return trimmed.includes(':') ? parseTime(trimmed, raw) : parseCount(trimmed, raw)
}

function parseTime(trimmed: string, raw: string): ScoreValue {
  const parts = trimmed.split(':')
  if (parts.length !== 2 || !parts.every((part) => INTEGER_RE.test(part))) {
    return { kind: 'invalid', raw, reason: '시간 형식이 올바르지 않음 (mm:ss 형식이어야 함)' }
  }

  const [minutes, seconds] = parts.map(Number)
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
