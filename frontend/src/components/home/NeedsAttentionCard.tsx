import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type {
  AttentionItem,
  AttentionKind,
  AuthErrorBody,
  SoftwareAttentionRow,
} from '../../services/api'
import { getProjectAttention, getSoftwareAttention } from '../../services/api'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'

export type NeedsAttentionFilter = 'all' | AttentionKind

export type NeedsAttentionCardProjectProps = {
  variant?: 'project'
  studioId: string
  softwareId: string
  projectId: string
}

export type NeedsAttentionCardSoftwareProps = {
  variant: 'software'
  studioId: string
  softwareId: string
  issuesProjectId: string | null
}

export type NeedsAttentionCardProps =
  | NeedsAttentionCardProjectProps
  | NeedsAttentionCardSoftwareProps

function pillLabel(kind: AttentionKind): string {
  switch (kind) {
    case 'conflict':
      return 'Conflict'
    case 'drift':
      return 'Drift'
    case 'gap':
      return 'Gap'
    case 'update':
      return 'Update'
  }
}

function pillClass(kind: AttentionKind): string {
  switch (kind) {
    case 'conflict':
      return 'border-rose-500/40 bg-rose-950/70 text-rose-200'
    case 'drift':
      return 'border-amber-500/40 bg-amber-950/50 text-amber-200'
    case 'gap':
      return 'border-violet-500/40 bg-violet-950/60 text-violet-200'
    case 'update':
      return 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
  }
}

function AttentionKindIcon({ kind }: { kind: AttentionKind }): ReactElement {
  const cls = 'h-3 w-3 shrink-0'
  switch (kind) {
    case 'conflict':
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
          <path d="M6 1L11 10H1L6 1z" />
        </svg>
      )
    case 'drift':
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M2 9c2.5-1 3-4 5.5-4.5M8 3.5c-1.5 1.2-1.8 3.5-4 5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'gap':
      return (
        <span className={`${cls} font-bold leading-none`} aria-hidden>
          ?
        </span>
      )
    case 'update':
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 6h6M6 3v6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

function rowHref(
  studioId: string,
  softwareId: string,
  projectId: string,
  item: AttentionItem,
): string {
  const base = `/studios/${studioId}/software/${softwareId}/projects/${projectId}`
  if (item.kind === 'drift' || item.kind === 'update') {
    return `${base}/work-orders`
  }
  if (item.links.section_id) {
    return `${base}/sections/${item.links.section_id}`
  }
  return `${base}/issues`
}

function AttentionRow({
  studioId,
  softwareId,
  projectId,
  item,
  line1,
  line2,
}: {
  studioId: string
  softwareId: string
  projectId: string
  item: AttentionItem
  line1: string
  line2: string
}): ReactElement {
  const href = rowHref(studioId, softwareId, projectId, item)
  const when = formatRelativeTimeUtc(item.occurred_at)
  return (
    <li className="border-b border-zinc-800 last:border-b-0">
      <Link
        to={href}
        className="flex gap-4 px-5 py-4 transition-colors hover:bg-zinc-800/30"
      >
        <div className="shrink-0 pt-0.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillClass(item.kind)}`}
          >
            <AttentionKindIcon kind={item.kind} />
            {pillLabel(item.kind)}
          </span>
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[12px] text-zinc-500">{line1}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-zinc-100">{line2}</p>
        </div>
        {when ? (
          <span className="shrink-0 pt-0.5 text-[11px] text-zinc-500">{when}</span>
        ) : (
          <span className="shrink-0 pt-0.5 text-[11px] text-zinc-600">—</span>
        )}
      </Link>
    </li>
  )
}

export function NeedsAttentionCard(props: NeedsAttentionCardProps): ReactElement {
  if (props.variant === 'software') {
    return <NeedsAttentionSoftware {...props} />
  }
  return <NeedsAttentionProject {...props} />
}

function issuesListHref(
  studioId: string,
  softwareId: string,
  projectId: string | null,
): string | null {
  if (!projectId) return null
  return `/studios/${studioId}/software/${softwareId}/projects/${projectId}/issues`
}

function NeedsAttentionSoftware({
  studioId,
  softwareId,
  issuesProjectId,
}: NeedsAttentionCardSoftwareProps): ReactElement {
  const q = useQuery({
    queryKey: ['software', softwareId, 'attention'],
    queryFn: () => getSoftwareAttention(softwareId),
    enabled: Boolean(studioId && softwareId),
  })

  const rows = useMemo(() => q.data?.items ?? [], [q.data?.items])
  const shown = rows.slice(0, 12)

  const err = q.error as AuthErrorBody | null
  const forbidden = Boolean(q.isError && err?.code === 'FORBIDDEN')
  const allHref = issuesListHref(studioId, softwareId, issuesProjectId)

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
            Needs attention
          </h2>
          <span className="text-[12px] text-zinc-500">across all projects</span>
        </div>
        {allHref && !forbidden ? (
          <Link
            to={allHref}
            className="shrink-0 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            View all issues →
          </Link>
        ) : null}
      </div>

      <div>
        {q.isPending ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">Loading…</p>
        ) : forbidden ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">
            Attention summary is not available for your access level.
          </p>
        ) : q.isError ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">
            Could not load attention items.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">
            Nothing needs your attention right now.
          </p>
        ) : (
          <ul>
            {shown.map((row: SoftwareAttentionRow) => {
              const line1 = row.project_name
              const line2 = [row.item.title, row.item.description]
                .filter(Boolean)
                .join(' — ')
              return (
                <AttentionRow
                  key={`${row.project_id}-${row.item.id}`}
                  studioId={studioId}
                  softwareId={softwareId}
                  projectId={row.project_id}
                  item={row.item}
                  line1={line1}
                  line2={line2 || row.item.title || '—'}
                />
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function NeedsAttentionProject({
  studioId,
  softwareId,
  projectId,
}: NeedsAttentionCardProjectProps): ReactElement {
  const [filter, setFilter] = useState<NeedsAttentionFilter>('all')

  const q = useQuery({
    queryKey: ['projects', projectId, 'attention'],
    queryFn: () => getProjectAttention(projectId),
    enabled: Boolean(studioId && softwareId && projectId),
  })

  const filtered = useMemo(() => {
    const items = q.data?.items ?? []
    if (filter === 'all') {
      return items
    }
    return items.filter((i) => i.kind === filter)
  }, [q.data?.items, filter])

  const counts = q.data?.counts
  const total = counts?.all ?? 0
  const shown = filtered.length

  const err = q.error as AuthErrorBody | null
  const forbidden = Boolean(q.isError && err?.code === 'FORBIDDEN')

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-100">Needs your attention</h2>
          {!forbidden && counts ? (
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {shown} of {total}
            </p>
          ) : null}
        </div>
      </div>

      {!forbidden ? (
        <div
          className="mt-4 flex flex-wrap gap-1.5 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-1"
          role="tablist"
          aria-label="Attention filter"
        >
          {(
            [
              ['all', 'All', counts?.all ?? 0],
              ['conflict', 'Conflicts', counts?.conflict ?? 0],
              ['drift', 'Drift', counts?.drift ?? 0],
              ['gap', 'Gaps', counts?.gap ?? 0],
              ['update', 'Updates', counts?.update ?? 0],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === key
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => setFilter(key as NeedsAttentionFilter)}
            >
              {label} {n}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        {q.isPending ? (
          <p className="text-[13px] text-zinc-500">Loading…</p>
        ) : forbidden ? (
          <p className="text-[13px] text-zinc-500">
            Attention summary is not available for your access level.
          </p>
        ) : q.isError ? (
          <p className="text-[13px] text-zinc-500">Could not load attention items.</p>
        ) : filtered.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            Nothing needs your attention right now.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-zinc-800/80">
            {filtered.map((item) => {
              const line2 = [item.subtitle, item.description].filter(Boolean).join(' — ')
              return (
                <AttentionRow
                  key={item.id}
                  studioId={studioId}
                  softwareId={softwareId}
                  projectId={projectId}
                  item={item}
                  line1={item.title}
                  line2={line2 || '—'}
                />
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
