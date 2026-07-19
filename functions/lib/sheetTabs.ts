// 시트 탭 이름 배열을 명단 / 목표 / 회차 3종으로 분류한다.
// 스키마 근거: docs/sheet-integration.html §02, 명명 규칙: docs/sheet-rules.html §01.
//
// NFC 정규화: Sheets API가 한글 탭 이름을 NFD(자모 분해)로 돌려줄 수 있어 비교는 항상
// NFC 정규화 후 수행한다. 단 반환값(roster/goals/rounds[].name)은 정규화하지 않은
// "원본" 문자열 그대로 돌려준다 — 이후 Sheets range 참조(예: '{탭이름}'!A1)는 실제 탭
// 타이틀 바이트와 정확히 일치해야 하므로, 정규화된 문자열을 돌려주면 원본이 NFD인
// 시트에서 해당 탭을 찾지 못하는 API 오류로 이어질 수 있다.
//
// 회차 탭 이름 규칙(docs/sheet-rules.html §01 "새 회차 탭 이름은 날짜 YYYY-MM-DD"):
// 정규식 매치만으로는 2025-02-30 같은 캘린더상 존재하지 않는 날짜를 걸러낼 수 없어
// Date.UTC로 만든 뒤 연/월/일을 다시 읽어 왕복 검증한다(오버플로우 시 다음 달로 밀림).

const ROSTER_TAB_NAME = '버니스명단'.normalize('NFC')
const GOALS_TAB_NAME = '목표'.normalize('NFC')
const ROUND_NAME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface RoundTab {
  /** 원본(비정규화) 탭 이름 — Sheets range 참조에 그대로 재사용 가능 */
  name: string
  /** UTC 자정 기준 파싱된 날짜 — 정렬·표시용 */
  date: Date
}

export interface SheetTabClassification {
  /** '버니스명단'과 매칭된 원본 탭 이름, 없으면 null */
  roster: string | null
  /** '목표'와 매칭된 원본 탭 이름, 없으면 null */
  goals: string | null
  /** 날짜 오름차순 정렬 — rounds.at(-1)이 최신 회차 */
  rounds: RoundTab[]
  /** 무엇에도 매칭되지 않았거나 중복으로 밀려난 원본 탭 이름 (입력 순서 유지) */
  unclassified: string[]
}

function parseRoundDate(normalizedName: string): Date | null {
  const match = ROUND_NAME_PATTERN.exec(normalizedName)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  // Date.UTC는 0~99년을 1900~1999년으로 매핑하는 레거시 동작이 있어(예: 25 → 1925),
  // 그런 입력은 아래 왕복 검증에서 항상 실패해 unclassified로 빠진다. 의도한 검증은
  // 아니지만 실사용에서 나올 수 없는 연도라 안전한 방향으로만 작동한다.
  const isValidCalendarDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return isValidCalendarDate ? date : null
}

// 회차 탭 이름 규칙(YYYY-MM-DD + 캘린더 유효)에 맞는지만 판정한다 — 쓰기 경로(#64)가
// 요청 sessionDate의 "날짜 형식 오류(400)"와 "회차 탭 없음(404)"을 구분하기 위해 형식 검증만
// 먼저 수행할 때 쓴다. 분류(classifySheetTabs)와 같은 parseRoundDate를 재사용해 규칙이 어긋나지 않게 한다.
export function isValidRoundTabName(name: string): boolean {
  return parseRoundDate(name.normalize('NFC')) !== null
}

export function classifySheetTabs(tabNames: string[]): SheetTabClassification {
  let roster: string | null = null
  let goals: string | null = null
  const rounds: RoundTab[] = []
  const unclassified: string[] = []

  for (const rawName of tabNames) {
    const normalizedName = rawName.normalize('NFC')

    if (normalizedName === ROSTER_TAB_NAME) {
      if (roster === null) roster = rawName
      else unclassified.push(rawName)
      continue
    }

    if (normalizedName === GOALS_TAB_NAME) {
      if (goals === null) goals = rawName
      else unclassified.push(rawName)
      continue
    }

    const date = parseRoundDate(normalizedName)
    if (date !== null) {
      rounds.push({ name: rawName, date })
      continue
    }

    unclassified.push(rawName)
  }

  rounds.sort((a, b) => a.date.getTime() - b.date.getTime())

  return { roster, goals, rounds, unclassified }
}
