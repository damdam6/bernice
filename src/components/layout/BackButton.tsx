import { ChevronLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

export function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  /** 'default' = 앱 안에서 쌓인 이전 히스토리가 없는 최초 진입(직접 링크 등) — navigate(-1)이 앱 밖으로 나갈 수 있어 홈으로 대체 */
  const hasHistory = location.key !== 'default'

  const handleClick = () => {
    if (hasHistory) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center text-sm font-semibold text-ink-sub transition-colors hover:text-ink"
    >
      <ChevronLeft className="size-5" />
      뒤로
    </button>
  )
}
