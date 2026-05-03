import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

import type { CopilotSideTab } from './CopilotStatusStrip'

export function CopilotTabs(props: {
  sideTab: CopilotSideTab
  onSelectTab: (tab: CopilotSideTab) => void
  critiqueBadge: number | null
  diffBadge: number | null
  variant?: 'bar' | 'inline-overflow'
}): ReactElement {
  const { sideTab, onSelectTab, critiqueBadge, diffBadge, variant = 'bar' } =
    props
  const [moreOpen, setMoreOpen] = useState(false)
  const moreWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!moreOpen) {
      return
    }
    const onDoc = (e: MouseEvent): void => {
      const el = moreWrapRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [moreOpen])

  const tabBtn = (id: CopilotSideTab, label: string, badge: number | null) => (
    <button
      type="button"
      role="tab"
      aria-selected={sideTab === id}
      className={`rounded px-3 py-1 text-xs font-medium ${
        sideTab === id
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300'
      }`}
      onClick={() => onSelectTab(id)}
    >
      {label}
      {badge != null && badge > 0 ? (
        <sup className="ml-0.5 text-[10px] text-violet-400">{badge}</sup>
      ) : null}
    </button>
  )

  if (variant === 'inline-overflow') {
    return (
      <div
        className="flex min-w-0 shrink-0 flex-1 items-center gap-1 px-2 py-1"
        role="tablist"
      >
        {tabBtn('chat', 'Chat', null)}
        <div className="relative ml-auto shrink-0" ref={moreWrapRef}>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            ⋯ More
          </button>
          {moreOpen ? (
            <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-md border border-zinc-800 bg-zinc-950 py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  onSelectTab('context')
                  setMoreOpen(false)
                }}
              >
                Context
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  onSelectTab('critique')
                  setMoreOpen(false)
                }}
              >
                Critique
                {critiqueBadge != null && critiqueBadge > 0 ? (
                  <sup className="ml-0.5 text-[10px] text-violet-400">
                    {critiqueBadge}
                  </sup>
                ) : null}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  onSelectTab('diff')
                  setMoreOpen(false)
                }}
              >
                Diff
                {diffBadge != null && diffBadge > 0 ? (
                  <sup className="ml-0.5 text-[10px] text-violet-400">
                    {diffBadge}
                  </sup>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex shrink-0 gap-1 border-b border-zinc-800 px-2 py-1"
      role="tablist"
    >
      {tabBtn('chat', 'Chat', null)}
      {tabBtn('context', 'Context', null)}
      {tabBtn('critique', 'Critique', critiqueBadge)}
      {tabBtn('diff', 'Diff', diffBadge)}
    </div>
  )
}
