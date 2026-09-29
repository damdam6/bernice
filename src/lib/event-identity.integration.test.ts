import { describe, expect, it } from 'vitest'
import { eventLabel } from '../../shared/event-identity'
import { parseRecordsResponse } from './parse-records-response'
import { buildGrowthCards, buildTrendSeries } from './profile-view'
import { parseGoals } from '../../functions/lib/parse-goals'
import { buildRecordsResponse } from '../../functions/lib/build-records-response'
import { buildCreateSheetPlan } from '../../functions/lib/create-sheet'
import { buildWritePlan, evaluateScores, mapHeaderToEvents, validateScoreKeys } from '../../functions/lib/record-write'
import type { SheetRawBundle } from '../../functions/lib/sheetsApi'

const HEADER = ['종목', '목표', '만점', '방향', '종료 회차', '면제 가능']
const ID_HEADER = [...HEADER, '종목 ID', '이전 종목명']
const OLD = '2026-06-01'
const NEW = '2026-09-01'
const AT = '2026-09-29T00:00:00Z'

function bundle(): SheetRawBundle {
  return {
    roster: { name: '버니스명단', values: [['이름', '상태'], ['가은', '활동']] },
    goals: { name: '목표', values: [ID_HEADER,
      ['패스', '3', '5', '높을수록', OLD, '', 'pass-old'],
      ['패스', '7', '10', '높을수록', '', '', 'pass-new'],
    ] },
    rounds: [
      { name: OLD, date: new Date(OLD), values: [['이름', 'id:pass-old\n패스'], ['가은', '4']] },
      { name: NEW, date: new Date(NEW), values: [['이름', 'id:pass-new\n패스'], ['가은', '6']] },
    ],
    unclassified: [],
  }
}

describe('#177 immutable event identity', () => {
  it('same names keep separate targets, sessions, rankings, trends, PBs and home rates', () => {
    const data = buildRecordsResponse(bundle(), AT)
    expect(data.events.map((e) => [e.id, e.name, e.targetValue])).toEqual([
      ['pass-old', '패스', 3], ['pass-new', '패스', 7],
    ])
    expect(data.sessions.map((s) => s.eventIds)).toEqual([['pass-old'], ['pass-new']])
    expect(data.rankings[0].events[0]).toMatchObject({ event: 'pass-old', entries: [{ value: 4, achieved: true }] })
    expect(data.rankings[1].events[0]).toMatchObject({ event: 'pass-new', entries: [{ value: 6, achieved: false }] })
    expect(data.players[0].trends.map((t) => [t.event, t.points.map((p) => p.value)])).toEqual([
      ['pass-old', [4]], ['pass-new', [6]],
    ])
    expect(data.players[0].personalBests.map((b) => [b.event, b.value])).toEqual([['pass-old', 4], ['pass-new', 6]])
    expect(data.home.achievementRates).toEqual([{ event: 'pass-new', achievedCount: 0, eligibleCount: 1, rate: 0 }])
    expect(parseRecordsResponse(JSON.parse(JSON.stringify(data)))).toEqual(data)
    const cards = buildGrowthCards(data.events, data.sessions[0], data.players[0], data.sessions)
    expect(cards[0]).toMatchObject({ eventKey: 'pass-old', ended: true, pb: '4', value: '4' })
    expect(cards[0].label).toContain('종료 · 2026-06-01 ~ 2026-06-01')
    expect(cards[1].label).toContain('진행 중 · 2026-09-01 ~ 2026-09-01')
    expect(buildTrendSeries(data.events[0], data.sessions, data.players, 1).highlight).toEqual([{ sessionIndex: 0, value: 4 }])
  })

  it('renaming and reordering persisted goal rows cannot relink historical results', () => {
    const source = bundle()
    const before = buildRecordsResponse(source, AT)
    source.goals!.values[1][0] = '체스트패스 (이전 기준)'
    source.goals!.values = [ID_HEADER, source.goals!.values[2], source.goals!.values[1]]
    const after = buildRecordsResponse(source, AT)
    expect(after.sessions).toEqual(before.sessions)
    expect(after.rankings).toEqual(before.rankings)
    expect(after.players[0].personalBests.find((b) => b.event === 'pass-old')).toEqual(before.players[0].personalBests[0])
    expect(after.players[0].trends.find((t) => t.event === 'pass-old')).toEqual(before.players[0].trends[0])
    expect(after.events.find((e) => e.id === 'pass-old')?.name).toBe('체스트패스 (이전 기준)')
  })

  it.each(['legacy', 'id'] as const)('%s sheet reads/writes by ID and creates an appropriate header', (mode) => {
    const rows = [mode === 'legacy' ? HEADER : ID_HEADER,
      mode === 'legacy' ? ['슛', '3', '5', '높을수록'] : ['슛', '3', '5', '높을수록', '', '', 'shot-1'],
    ]
    const parsed = parseGoals(rows)
    const id = mode === 'legacy' ? 'legacy-row-2' : 'shot-1'
    const header = ['이름', mode === 'legacy' ? '슛' : 'id:shot-1\n옛 표시 이름']
    const columns = mapHeaderToEvents(header, parsed.events, NEW)
    expect(columns[0].event.id).toBe(id)
    expect(validateScoreKeys({ [id]: '4' }, parsed.events)).toEqual({ missing: [], unknown: [] })
    expect(evaluateScores({ [id]: '4' }, parsed.events).scoreMap[id]).toEqual({ status: 'recorded', value: 4, display: '4' })
    expect(buildWritePlan(NEW, 2, columns, { [id]: '4' })).toEqual({ range: "'2026-09-01'!B2:B2", values: [['4']] })
    const plan = buildCreateSheetPlan({ ...parsed, sessionDate: NEW, existingSheetIds: [0],
      rosterName: '버니스명단', goalsName: '목표', players: [{ id: 1, name: '가은', status: '활동' }], participantIds: [1] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) throw new Error('unexpected plan failure')
    const update = plan.requests[1] as { updateCells: { rows: { values: { userEnteredValue: { formulaValue?: string } }[] }[] } }
    expect(update.updateCells.rows[0].values[1].userEnteredValue.formulaValue).toBe(mode === 'legacy'
      ? "='목표'!A2"
      : '="id:shot-1"&CHAR(10)&INDEX(\'목표\'!A:A,MATCH(TRUE,ARRAYFORMULA(EXACT("shot-1",\'목표\'!G:G)),0))')
  })

  it('legacy row IDs survive name changes and can be persisted without changing API identity', () => {
    const before = parseGoals([HEADER, ['슛', '3', '5', '높을수록'], [], ['패스', '2', '5', '높을수록']])
    const renamed = parseGoals([HEADER, ['슛 새 이름', '3', '5', '높을수록'], [], ['패스', '2', '5', '높을수록']])
    expect(renamed.events.map((e) => e.id)).toEqual(['legacy-row-2', 'legacy-row-4'])
    expect(before.events.map((e) => e.id)).toEqual(renamed.events.map((e) => e.id))
    const migrated = parseGoals([ID_HEADER, ['슛 새 이름', '3', '5', '높을수록', '', '', 'legacy-row-2', '슛']])
    expect(mapHeaderToEvents(['이름', '슛'], migrated.events, NEW)[0].event.id).toBe('legacy-row-2')
    expect(mapHeaderToEvents(['이름', 'id:legacy-row-2\n슛'], migrated.events, NEW)[0].event.id).toBe('legacy-row-2')
  })

  it('rejects duplicate IDs, partial ID migration and ambiguous names instead of guessing by date', () => {
    const rows = bundle().goals!.values
    expect(() => parseGoals([ID_HEADER, rows[1], [...rows[2].slice(0, 6), 'pass-old']])).toThrow(/ID가 중복/)
    expect(() => parseGoals([ID_HEADER, rows[1], rows[2].slice(0, 6)])).toThrow(/ID가 비어/)
    const { events } = parseGoals(rows)
    expect(() => mapHeaderToEvents(['이름', '패스'], events, OLD)).toThrow(/모호/)
    expect(() => mapHeaderToEvents(['이름', 'id:missing\n패스'], events, OLD)).toThrow(/찾을 수 없습니다/)
    expect(() => mapHeaderToEvents(['이름', 'id:pass-old\n패스', 'id:pass-old\n다른 이름'], events, OLD)).toThrow(/중복/)
    expect(() => mapHeaderToEvents(['이름', 'id:pass-old\n패스'], events, NEW)).toThrow(/종료/)
  })

  it('score writes respect physical column order even when two columns have identical names', () => {
    const { events } = parseGoals([ID_HEADER,
      ['패스', '3', '5', '높을수록', '', '', 'pass-old'],
      ['패스', '7', '10', '높을수록', '', '', 'pass-new']])
    const columns = mapHeaderToEvents(['이름', 'id:pass-new\n패스', 'id:pass-old\n패스'], events, NEW)
    expect(buildWritePlan(NEW, 3, columns, { 'pass-old': '4', 'pass-new': '8' }).values).toEqual([['8', '4']])
  })

  it.each(['definition', 'session', 'scores', 'ranking', 'trend', 'best', 'home'])('runtime parser rejects broken %s ID references', (kind) => {
    const data = buildRecordsResponse(bundle(), AT)
    if (kind === 'definition') data.events[1].id = data.events[0].id
    if (kind === 'session') data.sessions[0].eventIds.push('missing')
    if (kind === 'scores') data.sessions[0].entries[0].scores.missing = { status: 'unmeasured', value: null, display: null }
    if (kind === 'ranking') data.rankings[0].events[0].event = 'missing'
    if (kind === 'trend') data.players[0].trends[0].event = 'missing'
    if (kind === 'best') data.players[0].personalBests[0].event = 'missing'
    if (kind === 'home') data.home.achievementRates[0].event = 'missing'
    expect(parseRecordsResponse(data)).toBeNull()
  })

  it('a unique renamed event displays the name instead of exposing its ID', () => {
    const data = buildRecordsResponse(bundle(), AT)
    data.events[0].name = '체스트패스'
    expect(eventLabel(data.events[0], data.events, data.sessions)).toBe('체스트패스')
  })
})
