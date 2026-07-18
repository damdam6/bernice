import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function BackButton() {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="inline-flex items-center text-sm font-semibold text-ink-sub transition-colors hover:text-ink"
    >
      <ChevronLeft className="size-5" />
      뒤로
    </button>
  )
}
