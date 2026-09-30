import { describe, expect, it } from 'vitest'
import { buildRecordsResponse } from '../../functions/lib/build-records-response'
import type { SheetRawBundle } from '../../functions/lib/sheetsApi'
import { parseRecordsResponse } from './parse-records-response'
import { deriveSessionEvents, buildEventGuidance } from './ranking-view'
import { buildTrendSeries } from './profile-view'
import { eventAtSession } from '../../shared/event-target'

function fixture(): SheetRawBundle {
  return {
    roster: { name: '버니스명단', values: [['이름', '상태'], ['테스트선수', '활동']] },
    goals: { name: '목표', values: [
      ['종목', '목표', '만점', '방향', '종료 회차', '면제 가능', '종목 ID'],
      ['셔틀런', '1:17', '', '낮을수록', '', '', 'run'],
      ['슛', '5', '10', '높을수록', '', '', 'shot'],
    ] },
    targetHistory: { name: '목표 이력', values: [['적용 회차', '종목 ID', '목표'], ['2026-10-03', 'run', '1:15'], ['2026-10-03', 'shot', '7']] },
    rounds: ['2026-05-16', '2026-10-03', '2027-01-03'].map((name) => ({ name, date: new Date(name), values: [['이름', 'id:run\n셔틀런', 'id:shot\n슛'], ['테스트선수', '1:16', '6']] })),
    unclassified: [],
  }
}

describe('effective session targets', () => {
  it('preserves earlier achievement and links later trends/PBs using one ID', () => {
    const data = buildRecordsResponse(fixture(), '2026-09-30T00:00:00Z')
    expect(parseRecordsResponse(JSON.parse(JSON.stringify(data)))).toEqual(data)
    expect(data.rankings.map((r) => r.events.map((e) => e.entries[0].achieved))).toEqual([[true, true], [false, false], [false, false]])
    expect(data.players[0].trends[0].points.map((p) => [p.achieved, p.deltaFromPrevious])).toEqual([[true, null], [false, 0], [false, 0]])
    expect(data.players[0].personalBests).toHaveLength(2)
    expect(data.players[0].personalBests[0]).toMatchObject({ event: 'run', sessionDate: '2026-05-16', achieved: true })
    expect(data.home.achievementRates.every((r) => r.achievedCount === 0)).toBe(true)
    expect(buildEventGuidance(deriveSessionEvents(data.events, data.sessions[0])[0])).toContain('1:17')
    expect(buildEventGuidance(deriveSessionEvents(data.events, data.sessions[1])[0])).toContain('1:15')
    expect(buildTrendSeries(data.events[0], data.sessions, data.players, 1).goals?.map((p) => p.value)).toEqual([77, 75, 75])
    expect(data.events.every((e) => e.endSessionDate === null)).toBe(true)
  })

  it('supports multiple target changes without mutating original definitions', () => {
    const input = fixture()
    input.targetHistory!.values.push(['2027-01-03', 'run', '1:14'])
    const data = buildRecordsResponse(input, 'test')
    expect(data.events[0].target).toBe('1:17')
    expect(eventAtSession(data.events[0], '2027-01-03').target).toBe('1:14')
  })

  it.each([
    ['2026-10-03', 'missing', '1:15'],
    ['2026-10-04', 'run', '1:15'],
    ['2026-10-03', 'run', '75'],
    ['2026-10-03', 'shot', '11'],
    ['2026-10-03', 'run', '1:15'],
  ])('rejects invalid or duplicate history %j', (...row) => {
    const input = fixture()
    input.targetHistory!.values.push(row)
    expect(() => buildRecordsResponse(input, 'test')).toThrow()
  })

  it('rejects corrupt history in the client API contract', () => {
    const data = buildRecordsResponse(fixture(), 'test')
    data.events[0].targetHistory![0].targetValue = 999
    expect(parseRecordsResponse(data)).toBeNull()
  })

  it('keeps legacy bundles working without the optional history tab', () => {
    const input = fixture()
    delete input.targetHistory
    const data = buildRecordsResponse(input, 'test')
    expect(data.events[0].targetHistory).toBeUndefined()
    expect(data.rankings.every((r) => r.events[0].entries[0].achieved)).toBe(true)
  })
})
