import type { ReactNode } from 'react'
import { MobileFrame } from './MobileFrame'

// 어드민 하단 고정 확인 바(#156) — BottomNav(#107)와 동일 패턴: fixed 셸은 위치만 잡는
// 투명 레이어, 실제 바(그라데이션·패딩·safe-area)는 MobileFrame로 감싸 프레임 폭에
// 중앙정렬한다. 넓은 화면에서 콘텐츠 컬럼과 정렬되고, 프레임 폭 이하에서는 전폭과 같다.
export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10">
      <MobileFrame>
        <div className="bg-gradient-to-t from-canvas via-canvas px-4 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </MobileFrame>
    </div>
  )
}
