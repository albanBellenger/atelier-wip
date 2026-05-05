import type { ReactElement } from 'react'

import { Pill } from './atoms'
import type { OeContextItem } from './types'

export function ContextItemRow(props: {
  item: OeContextItem
  accent: string
  included: boolean
  onToggle: () => void
}): ReactElement {
  const { item, accent, included, onToggle } = props
  const pinned = Boolean(item.pinned)
  const includedOnly = included && !pinned
  const includedPinned = included && pinned

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
      <button
        type="button"
        disabled={pinned}
        onClick={onToggle}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          pinned ? 'cursor-default' : 'cursor-pointer'
        } ${
          includedOnly
            ? ''
            : includedPinned
              ? ''
              : 'border-zinc-600 bg-zinc-950'
        }`}
        style={
          includedOnly
            ? { backgroundColor: accent, borderColor: accent }
            : includedPinned
              ? {
                  borderColor: accent,
                  backgroundColor: `${accent}22`,
                }
              : undefined
        }
        aria-pressed={included}
      >
        {includedOnly ? <span className="text-[10px] leading-none text-white">✓</span> : null}
        {includedPinned ? (
          <span className="text-[10px] leading-none" style={{ color: accent }}>
            ✓
          </span>
        ) : null}
      </button>
      <Pill tone="zinc" mono>
        {item.kind}
      </Pill>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{item.name}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.auto ? (
          <Pill tone="cyan" mono>
            auto
          </Pill>
        ) : null}
        {item.conflict ? (
          <Pill tone="rose" mono>
            conflict
          </Pill>
        ) : null}
        {item.drift ? (
          <Pill tone="amber" mono>
            drift
          </Pill>
        ) : null}
        {item.pinned ? (
          <Pill tone="violet" mono>
            pinned
          </Pill>
        ) : null}
      </div>
      <div className="hidden h-1 w-20 overflow-hidden rounded-full bg-zinc-800 sm:block">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (item.tokens / 2000) * 100)}%`,
            backgroundColor: accent,
          }}
        />
      </div>
      <span className="font-mono text-[10.5px] text-zinc-500">{item.tokens}</span>
    </div>
  )
}
