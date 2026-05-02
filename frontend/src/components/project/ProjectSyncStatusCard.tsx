import type { ReactElement } from 'react'
import { useMemo } from 'react'

import type { SectionSummary } from '../../services/api'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'

export type ProjectSyncStatusCardProps = {
  sections: SectionSummary[]
  /** Short SHA from last GitLab commit on the software repo (baseline). */
  baselineSha: string | null
  /** Relative time for that commit (e.g. ``4h ago``). */
  baselineRelative: string | null
  /** When false, show copy to connect Git on the software record. */
  gitConfigured: boolean
  canPublish: boolean
  onPublishClick: () => void
}

function mdSlug(slug: string): string {
  const t = slug.trim()
  return t.endsWith('.md') ? t : `${t}.md`
}

type PendingRow = {
  section: SectionSummary
  kind: 'new' | 'modified'
}

function buildPendingRows(sections: SectionSummary[]): PendingRow[] {
  const rows: PendingRow[] = []
  for (const s of sections) {
    if (s.status === 'empty') {
      rows.push({ section: s, kind: 'new' })
    } else if (s.status === 'gaps' || s.status === 'conflict') {
      rows.push({ section: s, kind: 'modified' })
    }
  }
  return rows.sort((a, b) =>
    String(b.section.updated_at).localeCompare(String(a.section.updated_at)),
  )
}

export function ProjectSyncStatusCard(props: ProjectSyncStatusCardProps): ReactElement {
  const {
    sections,
    baselineSha,
    baselineRelative,
    gitConfigured,
    canPublish,
    onPublishClick,
  } = props

  const { newCount, modifiedCount, rows, pendingTotal } = useMemo(() => {
    let newC = 0
    let modC = 0
    for (const s of sections) {
      if (s.status === 'empty') newC += 1
      else if (s.status === 'gaps' || s.status === 'conflict') modC += 1
    }
    const list = buildPendingRows(sections)
    return {
      newCount: newC,
      modifiedCount: modC,
      rows: list,
      pendingTotal: newC + modC,
    }
  }, [sections])

  const clean = pendingTotal === 0

  const subtitle =
    baselineSha != null && baselineSha.length > 0 ? (
      <p className="mt-1 text-[11px] text-zinc-500">
        vs{' '}
        <span className="font-mono text-zinc-400">{baselineSha}</span>
        {baselineRelative ? (
          <>
            {' '}
            · {baselineRelative}
          </>
        ) : null}
      </p>
    ) : (
      <p className="mt-1 text-[11px] text-zinc-500">
        {gitConfigured
          ? 'vs — · no commits loaded yet'
          : 'vs — · connect Git on the software record'}
      </p>
    )

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-zinc-100">
            Sync status
          </h3>
          {subtitle}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            clean
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
          }`}
        >
          {clean ? 'clean' : `${pendingTotal} pending`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
          <div className="font-mono text-[22px] font-semibold tabular-nums text-amber-300">
            +{newCount}
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            new
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
          <div className="font-mono text-[22px] font-semibold tabular-nums text-amber-300">
            ~{modifiedCount}
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            modified
          </div>
        </div>
      </div>

      <ul className="mt-4 max-h-64 divide-y divide-zinc-800/60 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="py-6 text-center text-[12px] text-zinc-500">
            {gitConfigured
              ? 'Nothing pending — last baseline matches these section states.'
              : 'Configure Git to compare against commits.'}
          </li>
        ) : (
          rows.map(({ section, kind }) => {
            const when = formatRelativeTimeUtc(section.updated_at)
            const sym = kind === 'new' ? '+' : '~'
            const symClass =
              kind === 'new' ? 'text-emerald-400' : 'text-amber-400'
            return (
              <li
                key={section.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
              >
                <span className="flex min-w-0 items-center gap-2 font-mono text-[12px] text-zinc-200">
                  <span className={`w-3 shrink-0 ${symClass}`}>{sym}</span>
                  <span className="truncate">{mdSlug(section.slug)}</span>
                </span>
                <span className="shrink-0 text-[10.5px] text-zinc-600">
                  {when ?? '—'}
                </span>
              </li>
            )
          })
        )}
      </ul>

      {canPublish ? (
        <>
          <button
            type="button"
            className="mt-4 w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-[13px] font-medium text-white transition hover:bg-indigo-500"
            onClick={onPublishClick}
          >
            {pendingTotal > 0
              ? `Publish ${pendingTotal} change${pendingTotal === 1 ? '' : 's'} →`
              : 'Publish now'}
          </button>
          <p className="mt-2 text-center text-[10px] leading-relaxed text-zinc-600">
            Conflict + drift analysis runs automatically
          </p>
        </>
      ) : null}
    </section>
  )
}
