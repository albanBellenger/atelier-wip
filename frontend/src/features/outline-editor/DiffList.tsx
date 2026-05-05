import type { ReactElement } from 'react'

import type { OePendingDiff } from './types'

export function DiffList(props: {
  diffs: OePendingDiff[]
  onAccept: (diff: OePendingDiff) => void
  onReject: (diff: OePendingDiff) => void
}): ReactElement {
  if (props.diffs.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-zinc-500">No other pending diffs.</p>
    )
  }
  return (
    <div className="space-y-3 px-3 py-3">
      {props.diffs.map((d) => (
        <div
          key={d.id}
          className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3"
        >
          <div className="text-sm font-medium text-zinc-100">{d.title}</div>
          <div className="mt-2 font-mono text-[10.5px] text-emerald-400">{d.preview}</div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => props.onReject(d)}
              className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => props.onAccept(d)}
              className="rounded-md border border-emerald-600/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
            >
              Accept
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
