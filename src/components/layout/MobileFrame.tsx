import type { ReactNode } from 'react'

// 모바일 프레임 폭의 단일 사용처(#107) — 넓은 화면에서 콘텐츠를 중앙정렬 고정폭으로
// 가둔다. 폭 값 자체는 --container-frame 토큰(max-w-frame)이 정본이라 여기선 참조만 한다.
// 레이아웃 셸·게이트·최상위 화면·BottomNav가 전부 이 컴포넌트를 거쳐 폭 규칙을 공유한다.
// flex-1/pb-16 같은 화면별 레이아웃 의도는 className으로 주입한다.
export function MobileFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-frame ${className}`}>{children}</div>
}
