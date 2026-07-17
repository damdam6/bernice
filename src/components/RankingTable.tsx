import type { RankDirection, RankingEntry } from '../../shared/domain'

/** 표시 전용 확장 — 백엔드 RankingEntry[]는 활동+recorded만 남기지만(compute-rankings.ts),
 *  랭킹 테이블은 면제·미측정 선수도 함께 보여줘야 해서 두 상태를 더한 판별 유니온을 쓴다. */
export type RankingTableRow =
  | ({ status: 'recorded' } & RankingEntry)
  | { status: 'exempt' | 'unmeasured'; playerId: number; name: string }

export interface RankingTableProps {
  entries: RankingTableRow[]
  direction: RankDirection
}

const DIRECTION_LABEL: Record<RankDirection, string> = {
  낮을수록: '↓ 낮을수록 좋음',
  높을수록: '↑ 높을수록 좋음',
}

const ROW_STATUS_LABEL = {
  exempt: '면제',
  unmeasured: '미측정',
} as const

function findTiedRanks(entries: RankingTableRow[]): Set<number> {
  const counts = new Map<number, number>()
  for (const entry of entries) {
    if (entry.status !== 'recorded') continue
    counts.set(entry.rank, (counts.get(entry.rank) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([rank]) => rank))
}

export default function RankingTable({ entries, direction }: RankingTableProps) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-brand-200 bg-brand-50 p-6 text-center text-sm text-brand-700">
        표시할 기록이 없습니다.
      </p>
    )
  }

  const tiedRanks = findTiedRanks(entries)

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-brand-200 text-left text-brand-600">
          <th className="py-2 pr-3 font-semibold">순위</th>
          <th className="py-2 pr-3 font-semibold">이름</th>
          <th className="py-2 pr-3 font-semibold">
            기록 <span className="ml-1 font-normal text-brand-500">{DIRECTION_LABEL[direction]}</span>
          </th>
          <th className="py-2 font-semibold">달성</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.playerId} className="border-b border-brand-100 last:border-none">
            <td className="py-2 pr-3">
              {entry.status === 'recorded' ? (
                tiedRanks.has(entry.rank) ? `공동 ${entry.rank}위` : `${entry.rank}위`
              ) : (
                <span className="text-brand-400">{ROW_STATUS_LABEL[entry.status]}</span>
              )}
            </td>
            <td className="py-2 pr-3 font-medium text-brand-900">{entry.name}</td>
            <td className="py-2 pr-3 tabular-nums">{entry.status === 'recorded' ? entry.display : '–'}</td>
            <td className="py-2">
              {entry.status === 'recorded' && entry.achieved ? (
                <span className="inline-flex items-center rounded-full bg-good/15 px-2 py-0.5 text-xs font-semibold text-good">
                  달성
                </span>
              ) : (
                <span className="text-brand-300">–</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
