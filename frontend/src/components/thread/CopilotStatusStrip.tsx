import type { ReactElement } from 'react'

export type CopilotSideTab =
  | 'chat'
  | 'context'
  | 'critique'
  | 'diff'
  | 'sources'

export function CopilotStatusStrip(props: {
  driftCount: number
  gapCount: number
  tokenUsed: number | null
  tokenBudget: number | null
  sourcesCount: number | null
  onSelectTab: (tab: CopilotSideTab) => void
  variant?: 'full' | 'inline'
}): ReactElement {
  const {
    driftCount,
    gapCount,
    tokenUsed,
    tokenBudget,
    sourcesCount,
    onSelectTab,
    variant = 'full',
  } = props
  const tokLabel =
    tokenUsed != null && tokenBudget != null && tokenBudget > 0
      ? `${Math.round(tokenUsed / 1000)}k/${Math.round(tokenBudget / 1000)}k tok`
      : '— tok'
  const srcLabel =
    sourcesCount != null ? `${sourcesCount} src` : '— src'
  return (
    <div
      className={
        variant === 'inline'
          ? 'flex shrink-0 flex-wrap items-center justify-end gap-1 px-2 py-1 text-[11px] text-zinc-400'
          : 'flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-800/80 px-2 py-1.5 text-[11px] text-zinc-400'
      }
      data-testid="copilot-status-strip"
    >
      <button
        type="button"
        className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2 py-0.5 hover:border-amber-700/60 hover:text-amber-200/90"
        onClick={() => onSelectTab('critique')}
      >
        <span className="text-amber-400/90">⚠</span> {driftCount} drift
      </button>
      <button
        type="button"
        className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2 py-0.5 hover:border-amber-700/60 hover:text-amber-200/90"
        onClick={() => onSelectTab('critique')}
      >
        <span className="text-amber-400/90">⚠</span> {gapCount} gap
      </button>
      <button
        type="button"
        className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2 py-0.5 hover:border-violet-700/60 hover:text-violet-200/90"
        onClick={() => onSelectTab('context')}
      >
        ◐ {tokLabel}
      </button>
      <button
        type="button"
        className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2 py-0.5 hover:border-violet-700/60 hover:text-violet-200/90"
        onClick={() => onSelectTab('sources')}
      >
        {srcLabel}
      </button>
    </div>
  )
}
