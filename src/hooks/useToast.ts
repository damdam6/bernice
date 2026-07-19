// 토스트 상태 관리 — docs/prd-design.html §06: "하단 중앙 다크 필, 1.9초 자동 소멸".
// 기록지 만들기·참가자 추가(#67) 화면이 공유하고, 향후 선수별 입력 저장(#68)도 같은 패턴을 쓴다.
import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 1900

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // show()를 연달아 호출해도(예: 빠른 재시도) 이전 타이머가 먼저 지우지 않도록 리셋한다.
  const show = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(text)
    timerRef.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { message, show }
}
