import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { ReturnNavPayload } from '../../lib/returnNavigation'

export function ReturnNavLink(props: {
  target: ReturnNavPayload | null
  /** Merged with default compact link styles (layout, size, truncate). */
  className?: string
}): ReactElement | null {
  const { target, className = '' } = props
  if (!target) return null
  return (
    <Link
      to={target.path}
      className={`inline-flex max-w-[min(11rem,42vw)] shrink-0 items-center truncate text-[12px] leading-tight text-violet-400/90 hover:text-zinc-100 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${className}`.trim()}
      aria-label={`Return to ${target.label}`}
      title={`Return to ${target.label}`}
    >
      ← {target.label}
    </Link>
  )
}
