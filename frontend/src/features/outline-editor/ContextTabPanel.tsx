import type { ReactElement } from 'react'

import { StatLabel } from './atoms'
import { ContextItemRow } from './ContextItemRow'
import type { OeContextGroup } from './types'

export function ContextTabPanel(props: {
  groups: OeContextGroup[]
  totalTokens: number
  budget: number
  accent: string
  included: Record<string, boolean>
  onToggle: (id: string, pinned: boolean) => void
}): ReactElement {
  const pct = Math.min(100, Math.round((props.totalTokens / props.budget) * 100))
  return (
    <div className="space-y-4 px-3 py-3">
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <StatLabel>Tokens</StatLabel>
          <span className="font-mono text-[9.5px] text-zinc-400">
            {props.totalTokens.toLocaleString()} / {props.budget.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: props.accent }}
          />
        </div>
      </div>
      {props.groups.map((g) => (
        <div key={g.id}>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            {g.title}
          </div>
          <div className="mt-2 space-y-1.5">
            {g.items.map((it) => (
              <ContextItemRow
                key={it.id}
                item={it}
                accent={props.accent}
                included={props.included[it.id] ?? true}
                onToggle={() => props.onToggle(it.id, Boolean(it.pinned))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
