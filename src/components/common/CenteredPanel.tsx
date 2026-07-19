import type { ReactNode } from 'react'

// 로딩/에러/빈 상태 패널을 화면 중앙에 배치하는 공용 래퍼 — Rankings·RecordsDateSelect·
// RecordsParticipants·CreateSheet·AddPlayers가 동일한 마크업을 각자 정의하던 것을 통합한다.
export function CenteredPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6">{children}</div>
}
