import type { ReactElement } from 'react'

import { Pill } from './atoms'
import type { OeCritique } from './types'

export function CritiqueList(props: { items: OeCritique[] }): ReactElement {
  return (
    <div className="space-y-3 px-3 py-3">
      {props.items.map((c) => (
        <div
          key={c.id}
          className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={c.kind === 'gap' ? 'rose' : 'amber'} mono>
              {c.kind}
            </Pill>
            <span className="font-mono text-[10px] uppercase text-zinc-500">{c.severity}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-300">{c.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Show in editor
            </button>
            <button
              type="button"
              className="rounded-md border border-violet-600/40 bg-violet-500/10 px-2 py-1 text-xs text-violet-200 hover:bg-violet-500/20"
            >
              Ask copilot to fix
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
