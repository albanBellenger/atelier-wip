import type { ReactElement } from 'react'

import { StatLabel } from './atoms'
import type { OeHealthKey } from './types'

export function HealthRail(props: {
  healthOpen: OeHealthKey | null
  onToggle: (k: OeHealthKey) => void
}): ReactElement {
  const cells: { key: OeHealthKey; label: string; value: string }[] = [
    { key: 'drift', label: 'Drift', value: '0' },
    { key: 'gap', label: 'Gaps', value: '1' },
    { key: 'tok', label: 'Tokens', value: '2,535 / 6,000' },
    { key: 'src', label: 'Sources', value: '0 cited · 4 missing' },
  ]
  return (
    <div className="grid shrink-0 grid-cols-4 divide-x divide-zinc-800/80 border-b border-zinc-800/80 bg-[#0a0a0b]">
      {cells.map((c) => {
        const open = props.healthOpen === c.key
        return (
          <button
            key={c.key}
            type="button"
            aria-label={`${c.label} metric`}
            onClick={() => props.onToggle(c.key)}
            className={`flex flex-col items-stretch px-2 py-2 text-left transition-colors hover:bg-zinc-900/50 ${
              open ? 'bg-zinc-900/40' : ''
            }`}
          >
            <StatLabel>{c.label}</StatLabel>
            <div className="mt-1 font-mono text-xs text-zinc-200">{c.value}</div>
          </button>
        )
      })}
    </div>
  )
}

export function HealthDrawer(props: {
  openKey: OeHealthKey | null
  onClose: () => void
}): ReactElement | null {
  if (!props.openKey) return null
  const titles: Record<OeHealthKey, string> = {
    drift: 'Drift detail',
    gap: 'Gap detail',
    tok: 'Token budget',
    src: 'Sources coverage',
  }
  const bodies: Record<OeHealthKey, string> = {
    drift: 'No drift detected against the last indexed artifact set.',
    gap: 'One structural gap remains: missing citation for the SSOT statement.',
    tok: 'Included context consumes 2,535 of 6,000 tokens. Toggle items in Context to free budget.',
    src: 'Zero sources cited in-line; four referenced statements lack backing sources.',
  }
  return (
    <div className="shrink-0 border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
            {titles[props.openKey]}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
            {bodies[props.openKey]}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Close ✕
        </button>
      </div>
    </div>
  )
}
