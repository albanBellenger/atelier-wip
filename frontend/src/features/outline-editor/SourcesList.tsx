import type { ReactElement } from 'react'

import { Pill } from './atoms'
import type { OeSource } from './types'

export function SourcesList(props: { sources: OeSource[] }): ReactElement {
  return (
    <div className="space-y-2 px-3 py-3">
      {props.sources.map((s) =>
        s.missing ? (
          <div
            key={s.id}
            className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-3"
          >
            <p className="text-sm text-amber-200/90">
              1 missing citation — add a source for the SSOT statement.
            </p>
          </div>
        ) : (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
          >
            <Pill tone="zinc" mono>
              {s.kind}
            </Pill>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{s.name}</span>
            <span className="font-mono text-[9.5px] text-zinc-500">{s.ts}</span>
          </div>
        ),
      )}
    </div>
  )
}
