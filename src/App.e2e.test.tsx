// @vitest-environment jsdom
// 측정일 시나리오 E2E 스모크(#71) — 관리자 로그인 → 기록지 만들기 → 참가자 선택/추가 →
// 전원 입력(수정 포함) → 저장 즉시 랭킹 반영까지, 실제 <App/> 라우팅과 React Query 캐시를
// 통해 한 번에 검증한다. 브라우저 자동화 도구가 없어(package.json) 기존 관례(vitest +
// Testing Library + vi.stubGlobal('fetch', ...))를 그대로 확장했다 — 다른 점은 fetch 목이
// 세션 안에서 상태를 갖는다는 것뿐이다.
//
// 목 백엔드는 functions/lib/compute-rankings.ts 등을 import하지 않는다(tsconfig.app.json이
// functions/를 include하지 않아 애초에 불가능 — seoul-date.ts·korean-sort.ts가 이미 같은
// 이유로 프론트 사본을 두고 있다). 대신 검증의 단일 원천인 shared/build-event-score.ts만
// 재사용하고, 랭킹 계산은 이 픽스처(선수 3명·종목 4개) 규모에서 손으로 검산 가능한 수준으로
// 다시 구현했다.
//
// 한계 두 가지: (1) 실제 Cloudflare Functions·Google Sheets API를 호출하지 않으므로 "시트
// 참조 수식·서식 무손상"은 배포 환경에서 수동 확인이 필요하다. (2) jsdom은 실제 CSS 레이아웃을
// 계산하지 않아 "폰 뷰포트"를 시각적으로 증명할 수 없다 — window 크기만 의도적으로 맞춘다.
//
// "추이" 전용 화면(Players.tsx)은 아직 플레이스홀더라 화면 검증 대신 /api/records 응답의
// players[].trends 데이터 계약을 직접 확인한다(docs/plans/issue-71-e2e-record-input-smoke.html 참고).
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type {
  EventDefinition,
  EventRanking,
  EventScore,
  Player,
  PlayerEventTrend,
  RankingEntry,
  RecordsResponse,
  Session,
  SessionEntry,
} from '../shared/domain'
import { buildEventScore } from '../shared/build-event-score'
import { compareKorean } from './lib/korean-sort'
import { formatSeoulDate } from './lib/seoul-date'
import App from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ADMIN_CODE = 'admin-secret-71'

const EVENTS: EventDefinition[] = [
  { key: '드리블셔틀런', valueKind: 'time', target: '0:58', targetValue: 58, maxScore: null, direction: '낮을수록' },
  { key: '골밑슛', valueKind: 'count', target: '7', targetValue: 7, maxScore: 10, direction: '높을수록' },
  { key: '자유투', valueKind: 'count', target: '3', targetValue: 3, maxScore: 5, direction: '높을수록' },
  { key: '45도패스캐치', valueKind: 'count', target: '5', targetValue: 5, maxScore: 7, direction: '높을수록' },
]

// satisfies로 Player[] 형태를 검증하되 status 리터럴('활동')은 넓히지 않는다 — 아래
// snapshot()이 이 배열을 그대로 PlayerSummary[](status: Exclude<PlayerStatus, '탈퇴'>)로
// 조립하므로, 여기서 PlayerStatus 전체로 넓혀지면 그 조립이 타입 에러가 난다.
const PLAYERS = [
  { id: 1, name: '선수1', status: '활동' },
  { id: 2, name: '선수2', status: '활동' },
  { id: 3, name: '선수3', status: '활동' },
] satisfies Player[]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function makeEntry(player: Player): SessionEntry {
  return {
    playerId: player.id,
    name: player.name,
    scores: Object.fromEntries(EVENTS.map((event) => [event.key, buildEventScore('', event)])),
    participated: false,
  }
}

// functions/lib/compute-rankings.ts의 computeEventRanking과 같은 규칙(활동+recorded만,
// 방향별 정렬, 표준 공동순위)을 이 테스트의 작은 고정 픽스처 범위에서 재현한다 — 그 알고리즘
// 자체의 전체 커버리지는 compute-rankings.test.ts가 이미 갖고 있다.
function computeEventRanking(event: EventDefinition, session: Session): EventRanking {
  const recorded = session.entries
    .map((entry) => ({ entry, score: entry.scores[event.key] }))
    .filter((item): item is { entry: SessionEntry; score: Extract<EventScore, { status: 'recorded' }> } =>
      item.score.status === 'recorded',
    )
    .sort((a, b) => (event.direction === '낮을수록' ? a.score.value - b.score.value : b.score.value - a.score.value))

  const entries: RankingEntry[] = []
  let previousValue: number | null = null
  let previousRank = 0
  recorded.forEach(({ entry, score }, index) => {
    const rank = score.value === previousValue ? previousRank : index + 1
    previousValue = score.value
    previousRank = rank
    const achieved = event.direction === '낮을수록' ? score.value <= event.targetValue : score.value >= event.targetValue
    entries.push({ playerId: entry.playerId, name: entry.name, value: score.value, display: score.display, rank, achieved })
  })

  return { event: event.key, entries }
}

// 이 픽스처엔 세션이 최대 1개뿐이라 deltaFromPrevious/improved는 항상 null(첫 유효 기록)이다.
function buildTrends(playerId: number, session: Session | null): PlayerEventTrend[] {
  return EVENTS.map((event) => {
    const score = session?.entries.find((entry) => entry.playerId === playerId)?.scores[event.key]
    if (!session || !score || score.status !== 'recorded') return { event: event.key, points: [] }
    const achieved = event.direction === '낮을수록' ? score.value <= event.targetValue : score.value >= event.targetValue
    return {
      event: event.key,
      points: [
        { sessionDate: session.date, value: score.value, display: score.display, achieved, deltaFromPrevious: null, improved: null },
      ],
    }
  })
}

function createRecordsBackend() {
  let adminSession = false
  let sessionState: Session | null = null
  let lastResponse: RecordsResponse | null = null

  function snapshot(): RecordsResponse {
    const sessions = sessionState ? [sessionState] : []
    const response: RecordsResponse = {
      generatedAt: '2026-07-19T00:00:00.000Z',
      events: EVENTS,
      players: PLAYERS.map((player) => ({ ...player, trends: buildTrends(player.id, sessionState), personalBests: [] })),
      sessions,
      rankings: sessions.map((session) => ({
        sessionDate: session.date,
        events: EVENTS.map((event) => computeEventRanking(event, session)),
      })),
      home: { latestSession: null, achievementRates: [] },
    }
    lastResponse = response
    return response
  }

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>

    if (method === 'POST' && url === '/api/login') {
      if (body.code === ADMIN_CODE) {
        adminSession = true
        return jsonResponse(200, { ok: true, role: 'admin' })
      }
      return jsonResponse(401, { error: 'invalid_passcode', message: '패스코드가 올바르지 않습니다.' })
    }

    if (!adminSession) return jsonResponse(401, { error: 'unauthorized', message: '로그인이 필요합니다.' })

    if (method === 'GET' && url === '/api/records') {
      return jsonResponse(200, snapshot())
    }

    if (method === 'POST' && url === '/api/admin/create-sheet') {
      const participantIds = body.participantIds as number[]
      const participants = PLAYERS.filter((player) => participantIds.includes(player.id)).sort(compareKorean)
      sessionState = { date: formatSeoulDate(new Date()), entries: participants.map((player) => makeEntry(player)) }
      return jsonResponse(201, { sessionDate: sessionState.date, participantCount: participants.length })
    }

    if (method === 'POST' && url === '/api/admin/add-players') {
      if (!sessionState) return jsonResponse(404, { error: 'session_not_found', message: '회차를 찾을 수 없습니다.' })
      const playerIds = body.playerIds as number[]
      const added = PLAYERS.filter((player) => playerIds.includes(player.id))
      sessionState = { ...sessionState, entries: [...sessionState.entries, ...added.map((player) => makeEntry(player))] }
      return jsonResponse(200, {
        sessionDate: sessionState.date,
        added: added.map((player) => ({ playerId: player.id, name: player.name })),
      })
    }

    if (method === 'POST' && url === '/api/admin/records') {
      if (!sessionState) return jsonResponse(404, { error: 'session_not_found', message: '회차를 찾을 수 없습니다.' })
      const playerId = body.playerId as number
      const scores = body.scores as Record<string, string>
      const player = PLAYERS.find((candidate) => candidate.id === playerId)
      if (!player) return jsonResponse(400, { error: 'validation_failed', message: '존재하지 않는 선수입니다.' })

      const scoreMap: Record<string, EventScore> = {}
      for (const event of EVENTS) scoreMap[event.key] = buildEventScore(scores[event.key], event)

      sessionState = {
        ...sessionState,
        entries: sessionState.entries.map((entry) => (entry.playerId === playerId ? { ...entry, scores: scoreMap } : entry)),
      }
      return jsonResponse(200, { sessionDate: sessionState.date, playerId, name: player.name, scores: scoreMap })
    }

    throw new Error(`E2E 목이 처리하지 않는 요청: ${method} ${url}`)
  }

  return { handle, getLastResponse: () => lastResponse }
}

function renderApp(client: QueryClient, initialEntries: string[]) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('측정일 시나리오 (E2E 스모크)', () => {
  it('관리자 로그인 → 기록지 만들기 → 참가자 선택/추가 → 전원 입력(수정 포함) → 저장 즉시 랭킹 반영', async () => {
    // jsdom은 실제 CSS 레이아웃을 계산하지 않아 반응형을 검증할 수 없다 — 폰 뷰포트 의도만 표시.
    window.innerWidth = 390
    window.innerHeight = 844
    window.dispatchEvent(new Event('resize'))

    const backend = createRecordsBackend()
    vi.stubGlobal('fetch', vi.fn(backend.handle))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })

    // 1. 관리자 로그인
    const admin = renderApp(client, ['/admin/login'])
    fireEvent.change(screen.getByLabelText('관리자 코드'), { target: { value: ADMIN_CODE } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await screen.findByText('시트 관리')

    // 2. 기록지 만들기 — 참가자 선택(3명 중 2명만)
    fireEvent.click(screen.getByRole('button', { name: '기록지 만들기' }))
    await screen.findByRole('heading', { name: '기록지 만들기' })
    fireEvent.click(screen.getByRole('button', { name: '선수1' }))
    fireEvent.click(screen.getByRole('button', { name: '선수2' }))
    fireEvent.click(screen.getByRole('button', { name: '2명으로 기록지 만들기' }))

    await screen.findByRole('heading', { name: '참가자 목록' })
    expect(await screen.findByText(/기록지 생성됨/)).toBeInTheDocument()
    expect(screen.queryByText(/선수3/)).not.toBeInTheDocument()

    // 3. 참가자 추가 — 늦은 합류자 선수3 (다른 진입 경로가 같은 참가자 목록에 합쳐짐을 함께 증명)
    fireEvent.click(screen.getByRole('button', { name: '참가자 추가' }))
    await screen.findByRole('heading', { name: '참가자 추가' })
    fireEvent.click(screen.getByRole('button', { name: '선수3' }))
    fireEvent.click(screen.getByRole('button', { name: '1명 추가하기' }))

    await screen.findByRole('heading', { name: '참가자 목록' })
    expect(await screen.findByText(/1명 추가됨/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /선수3/ })).toBeInTheDocument()

    // 4. 전원 입력 — 선수1
    fireEvent.click(screen.getByRole('button', { name: /^선수1/ }))
    await screen.findByText('선수1')
    fireEvent.change(screen.getByLabelText('드리블셔틀런 분'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('드리블셔틀런 초'), { target: { value: '05' } })
    fireEvent.change(screen.getByLabelText('골밑슛 개수'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('자유투 개수'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('45도패스캐치 개수'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByRole('heading', { name: '참가자 목록' })
    expect(await screen.findByText(/선수1 저장됨/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /선수1.*완료/ })).toBeInTheDocument()

    // 5. 선수2 — 면제 가능 종목(45도패스캐치)만 면제 토글 사용
    fireEvent.click(screen.getByRole('button', { name: /^선수2/ }))
    await screen.findByText('선수2')
    fireEvent.change(screen.getByLabelText('드리블셔틀런 분'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('드리블셔틀런 초'), { target: { value: '55' } })
    fireEvent.change(screen.getByLabelText('골밑슛 개수'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('자유투 개수'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('switch', { name: '45도패스캐치 면제' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByRole('heading', { name: '참가자 목록' })
    expect(await screen.findByText(/선수2 저장됨/)).toBeInTheDocument()

    // 6. 선수3 — 이로써 "전원 입력" 충족
    fireEvent.click(screen.getByRole('button', { name: /^선수3/ }))
    await screen.findByText('선수3')
    fireEvent.change(screen.getByLabelText('드리블셔틀런 분'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('드리블셔틀런 초'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('골밑슛 개수'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('자유투 개수'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('45도패스캐치 개수'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByRole('heading', { name: '참가자 목록' })
    expect(await screen.findByText(/선수3 저장됨/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /선수1.*완료/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /선수2.*완료/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /선수3.*완료/ })).toBeInTheDocument()

    // 7. 수정 — 선수1의 골밑슛을 6 → 9로 정정(자유 수정, 마지막 저장 승리)
    fireEvent.click(screen.getByRole('button', { name: /^선수1/ }))
    await screen.findByText('선수1')
    expect(screen.getByLabelText('골밑슛 개수')).toHaveValue('6') // 기존 값 프리필 확인
    fireEvent.change(screen.getByLabelText('골밑슛 개수'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByRole('heading', { name: '참가자 목록' })

    admin.unmount()

    // 8. 랭킹 화면 — 같은 QueryClient를 공유하는 별도 세션(팀원 열람)에서 즉시 반영 확인.
    // 관리자 스택(AdminLayout)과 팀 탭(MainLayout) 사이엔 실제 앱에도 내비게이션 링크가 없어
    // (관리자 코드로 로그인한 뒤 팀 탭을 보려면 실제로도 주소를 직접 이동해야 한다), 같은
    // queryClient를 공유하는 두 번째 마운트로 "같은 세션, 다른 화면"을 재현한다.
    renderApp(client, ['/rankings'])
    await screen.findByRole('heading', { name: '랭킹' })

    fireEvent.click(screen.getByRole('button', { name: '골밑슛' }))
    await screen.findByText('1위')
    expect(screen.getByText('1위').closest('div')).toHaveTextContent('선수1')
    expect(screen.getByText('2위').closest('div')).toHaveTextContent('선수2')
    expect(screen.getByText('3위').closest('div')).toHaveTextContent('선수3')

    fireEvent.click(screen.getByRole('button', { name: '45도패스캐치' }))
    await screen.findByText('선수2')
    expect(screen.getByText('선수2').closest('div')).toHaveTextContent('면제')

    // 9. "추이" 데이터 계약 확인 — 소비 화면(Players.tsx)이 아직 없어(현황 분석 참고),
    // 목이 캡처해 둔 마지막 GET /api/records 응답에서 수정된 값이 반영됐는지 직접 확인한다.
    const finalRecords = backend.getLastResponse()
    const player1Trend = finalRecords?.players.find((player) => player.id === 1)?.trends.find((trend) => trend.event === '골밑슛')
    expect(player1Trend?.points).toHaveLength(1)
    expect(player1Trend?.points[0]).toMatchObject({ value: 9, display: '9' })
  })
})
