import type { ReactElement } from 'react'

import type { SoftwareArtifactRow } from '../../services/api'
import { ArtifactScopeBadge } from './ArtifactScopeBadge'

export type ArtifactExclusionPanelMode = 'software' | 'project'

export function ArtifactExclusionPanel(props: {
  title: string
  description: string
  rows: SoftwareArtifactRow[]
  isPending: boolean
  isError: boolean
  mode: ArtifactExclusionPanelMode
  canEdit: boolean
  isSavingId: string | null
  onToggleExcluded: (artifactId: string, nextExcluded: boolean) => void
}): ReactElement {
  const { rows, canEdit, mode, isSavingId, onToggleExcluded } = props

  return (
    <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-sm font-medium text-zinc-300">{props.title}</h2>
      <p className="mt-1 text-xs text-zinc-500">{props.description}</p>
      {props.isPending ? (
        <p className="mt-4 text-[13px] text-zinc-500">Loading artifacts…</p>
      ) : null}
      {props.isError ? (
        <p className="mt-4 text-[13px] text-red-400">Could not load artifacts.</p>
      ) : null}
      {!props.isPending && !props.isError && rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-zinc-500">No artifacts in this software yet.</p>
      ) : null}
      {!props.isPending && !props.isError && rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-zinc-800/90">
          {rows.map((row) => {
            const excluded =
              mode === 'software'
                ? row.excluded_at_software != null
                : row.excluded_at_project != null
            return (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 first:pt-0"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">
                  <ArtifactScopeBadge level={row.scope_level} />
                  <span className="min-w-0 truncate text-[13px] font-medium text-zinc-100">
                    {row.name}
                  </span>
                  <span className="min-w-0 break-words text-[11px] text-zinc-500">
                    {row.project_name}
                    {row.excluded_at_software != null && mode === 'project' ? (
                      <span className="text-zinc-600"> · Excluded at software</span>
                    ) : null}
                  </span>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={isSavingId === row.id}
                    role="switch"
                    aria-checked={excluded}
                    aria-label={
                      excluded
                        ? `Include ${row.name} in ${mode} context`
                        : `Exclude ${row.name} from ${mode} context`
                    }
                    onClick={() => onToggleExcluded(row.id, !excluded)}
                    className="relative z-10 flex h-11 min-h-[44px] w-[52px] min-w-[48px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      className={`relative h-5 w-9 overflow-hidden rounded-full border transition-colors ${
                        excluded
                          ? 'border-rose-500 bg-rose-600'
                          : 'border-zinc-600 bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none absolute top-0.5 h-4 w-4 rounded-full bg-zinc-100 shadow transition-transform ${
                          excluded ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
                        }`}
                        aria-hidden
                      />
                    </span>
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
