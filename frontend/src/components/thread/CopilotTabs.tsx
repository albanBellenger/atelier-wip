import type { ReactElement } from 'react'

import type { CopilotSideTab } from './CopilotStatusStrip'

export function CopilotTabs(props: {
  sideTab: CopilotSideTab
  onSelectTab: (tab: CopilotSideTab) => void
  critiqueBadge: number | null
  diffBadge: number | null
}): ReactElement {
  const { sideTab, onSelectTab, critiqueBadge, diffBadge } = props
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
