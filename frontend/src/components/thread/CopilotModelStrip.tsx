import type { ReactElement } from 'react'

type ConnectionTone = 'ok' | 'warn' | 'error'

export function CopilotModelStrip(props: {
  displayLine: string
  connection: ConnectionTone
  /** e.g. "Tool default" — product copy for global admin_config model. */
  scopeBadge: string
  /** `inline` sits on one row (e.g. beside Send); `bar` is the full-width strip. */
  variant?: 'bar' | 'inline'
}): ReactElement {
  const { displayLine, connection, scopeBadge, variant = 'bar' } = props
  const dot =
    connection === 'ok'
      ? 'bg-emerald-500'
      : connection === 'warn'
        ? 'bg-amber-500'
        : 'bg-red-500'
  if (variant === 'inline') {
    return (
      <div
        className="flex min-w-0 max-w-full items-center gap-1.5 text-[10px] text-zinc-500"
        title={`${displayLine} · ${scopeBadge}`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
          aria-hidden
        />
        <span className="min-w-0 truncate text-zinc-400">{displayLine}</span>
        <span className="shrink-0 rounded bg-zinc-800/90 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-zinc-500">
          {scopeBadge}
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-1.5 text-xs text-zinc-400">
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`}
        aria-hidden
      />
      <span className="truncate text-zinc-300" title={displayLine}>
        {displayLine}
      </span>
      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
        {scopeBadge}
      </span>
    </div>
  )
}
