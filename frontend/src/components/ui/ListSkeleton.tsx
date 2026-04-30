import type { ReactElement } from 'react'

type Props = {
  /** Number of placeholder rows (default 4). */
  rows?: number
}

export function ListSkeleton(props: Props): ReactElement {
  const rows = props.rows ?? 4
  return (
    <ul
      className="space-y-2"
      aria-busy="true"
      aria-label="Loading list"
      data-testid="list-skeleton"
    >
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
        >
          <div className="h-4 max-w-[40%] rounded bg-zinc-800" />
          <div className="mt-2 h-3 max-w-[70%] rounded bg-zinc-800/80" />
        </li>
      ))}
    </ul>
  )
}
