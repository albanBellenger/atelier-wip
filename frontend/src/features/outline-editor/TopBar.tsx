import type { ReactElement } from 'react'

import { BellIcon } from './atoms'

const peerInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || '?'
}

export function TopBar(props: {
  accent: string
  presence: { name: string; color: string }[]
}): ReactElement {
  const { accent, presence } = props
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/80 bg-[#0a0a0b] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="h-8 w-8 shrink-0 rounded-md bg-zinc-900 ring-1 ring-zinc-800"
          style={{ boxShadow: `inset 0 0 0 1px ${accent}33` }}
        />
        <nav className="hidden min-w-0 truncate text-xs text-zinc-500 sm:block">
          <span className="text-zinc-400">Atelier</span>
          <span className="mx-1.5 text-zinc-700">/</span>
          <span>Studio</span>
          <span className="mx-1.5 text-zinc-700">/</span>
          <span>Software</span>
          <span className="mx-1.5 text-zinc-700">/</span>
          <span className="text-zinc-300">Golden copy</span>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="-space-x-2 flex">
          {presence.map((p, i) => (
            <span
              key={`${p.name}-${i}`}
              title={p.name}
              className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-zinc-950 text-[10px] font-medium text-zinc-100"
              style={{
                borderColor: `${p.color}66`,
                zIndex: presence.length - i,
              }}
            >
              {peerInitials(p.name)}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Notifications"
        >
          <BellIcon size={18} />
        </button>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-200"
          title="You"
        >
          AB
        </div>
      </div>
    </header>
  )
}
