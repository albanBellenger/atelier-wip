import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import { getPrimaryModLabel } from '../../lib/modKeyLabel'

export type BuilderShortcutsCardProps = {
  studioId: string
  softwareId: string
  projectId: string
  /** Issues / run analysis — Studio Owners and Builders only (same as Issues nav link). */
  showAnalysis: boolean
  canPublish: boolean
  /** Generate WO modal — Studio Owners and Builders only. */
  showGenerateWo: boolean
  showOpenGraph: boolean
}

function Kbd(props: { children: string }): ReactElement {
  const { children } = props
  return (
    <kbd className="rounded border border-zinc-700 bg-zinc-950 px-1 py-px font-mono text-[10px] text-zinc-400">
      {children}
    </kbd>
  )
}

export function BuilderShortcutsCard(
  props: BuilderShortcutsCardProps,
): ReactElement | null {
  const {
    studioId,
    softwareId,
    projectId,
    showAnalysis,
    canPublish,
    showGenerateWo,
    showOpenGraph,
  } = props

  const mod = getPrimaryModLabel()
  const base = `/studios/${studioId}/software/${softwareId}/projects/${projectId}`

  type Entry = {
    key: string
    label: string
    to: string
    keys: ReactElement
  }

  const entries: Entry[] = []

  if (showAnalysis) {
    entries.push({
      key: 'analysis',
      label: 'Run analysis',
      to: `${base}/issues`,
      keys: (
        <span className="flex flex-wrap gap-0.5">
          <Kbd>{mod}</Kbd>
          <Kbd>A</Kbd>
        </span>
      ),
    })
  }
  if (canPublish) {
    entries.push({
      key: 'publish',
      label: 'Publish to Git',
      to: `${base}?publish=1`,
      keys: (
        <span className="flex flex-wrap gap-0.5">
          <Kbd>{mod}</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>P</Kbd>
        </span>
      ),
    })
  }
  if (showGenerateWo) {
    entries.push({
      key: 'gen',
      label: 'Generate WO',
      to: `${base}/work-orders?generate=1`,
      keys: (
        <span className="flex flex-wrap gap-0.5">
          <Kbd>{mod}</Kbd>
          <Kbd>G</Kbd>
        </span>
      ),
    })
  }
  if (showOpenGraph) {
    entries.push({
      key: 'graph',
      label: 'Open graph',
      to: `${base}?tab=graph`,
      keys: (
        <span className="flex flex-wrap gap-0.5">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd>
        </span>
      ),
    })
  }

  if (entries.length === 0) {
    return null
  }

  const gridBtn =
    'flex min-h-[72px] flex-col items-start justify-between rounded-xl border border-zinc-700/90 bg-zinc-950/50 px-3 py-2.5 text-left text-[13px] font-medium text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900/80'

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h3 className="text-[13px] font-medium text-zinc-200">Shortcuts</h3>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {entries.map((e) => (
          <Link key={e.key} to={e.to} className={gridBtn}>
            <span>{e.label}</span>
            {e.keys}
          </Link>
        ))}
      </div>
    </section>
  )
}
