import type { ReactElement } from 'react'

export type RecentUpdateItem =
  | {
      id: string
      kind: 'llm_patch'
      ts: string
      summary: string
    }
  | {
      id: string
      kind: 'peer_edit'
      ts: string
      summary: string
    }
  | {
      id: string
      kind: 'drift'
      ts: string
      workOrderTitle: string
      workOrderId: string
      reason: string
    }

export function RecentUpdatesFeed(props: {
  items: RecentUpdateItem[]
  onDriftClick: () => void
  /** When false, drift rows are plain text (e.g. read-only / viewer surface). */
  driftInteractive?: boolean
}): ReactElement {
  const { items, onDriftClick, driftInteractive = true } = props
  if (items.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-2 py-2 text-xs text-zinc-500"
        data-testid="recent-updates-feed"
      >
        No recent updates yet.
      </div>
    )
  }
  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-2 text-xs"
      data-testid="recent-updates-feed"
    >
      <p className="mb-1 font-medium text-zinc-400">Recent updates</p>
      <ul className="space-y-1.5 text-zinc-300">
        {items.map((row) => (
          <li key={row.id}>
            {row.kind === 'llm_patch' ? (
              <span className="text-zinc-300">• {row.summary}</span>
            ) : row.kind === 'peer_edit' ? (
              <span className="text-emerald-200/90">• {row.summary}</span>
            ) : driftInteractive ? (
              <button
                type="button"
                className="w-full text-left text-zinc-300 hover:text-violet-300"
                onClick={() => onDriftClick()}
              >
                • Drift on {row.workOrderTitle} — {row.reason}
              </button>
            ) : (
              <span className="text-zinc-400" data-testid="drift-row-static">
                • Drift on {row.workOrderTitle} — {row.reason}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
