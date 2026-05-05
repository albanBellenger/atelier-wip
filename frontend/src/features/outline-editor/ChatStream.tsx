import type { ReactElement } from 'react'

import type { OeThreadMsg } from './types'

export function ChatStream(props: { thread: OeThreadMsg[] }): ReactElement {
  return (
    <div className="space-y-3 px-3 py-3">
      {props.thread.map((m) => {
        if (m.role === 'user') {
          return (
            <div key={m.id} className="ml-6 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
              {m.text}
            </div>
          )
        }
        return (
          <div key={m.id} className="mr-6 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300">
            <p>{m.text}</p>
            {m.refs && m.refs.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.refs.map((r) => (
                  <button
                    key={r.diffId}
                    type="button"
                    className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 font-mono text-[9.5px] text-violet-200 hover:bg-violet-500/20"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
