import type { ReactElement } from 'react'

import { Kbd } from '../atoms/Kbd'

export function CopilotToggle(props: {
  open: boolean
  onToggle: () => void
  badgeCount?: number
}): ReactElement {
  const { open, onToggle, badgeCount = 0 } = props
  const showBadge = badgeCount > 0
  const label = badgeCount > 9 ? '9+' : String(badgeCount)

  return (
    <button
      type="button"
      data-testid="copilot-header-toggle"
      aria-pressed={open}
      aria-expanded={open}
      aria-controls="copilot-overlay-panel"
      onClick={onToggle}
      className={`relative flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition ${
        open
          ? 'border-violet-500/40 bg-violet-500/10 text-violet-200'
          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        className="shrink-0 text-current"
        aria-hidden
      >
        <path
          d="M6 1l1.4 3.2L10.7 5.5 7.4 6.8 6 10l-1.4-3.2L1.3 5.5 4.6 4.2z"
          fill="currentColor"
        />
      </svg>
      <span>Copilot</span>
      {showBadge ? (
        <span
          data-testid="copilot-toggle-badge"
          className="rounded-full bg-rose-500/90 px-1.5 py-px font-mono text-[9px] leading-none text-white"
        >
          {label}
        </span>
      ) : null}
      <Kbd>⌘K</Kbd>
    </button>
  )
}
