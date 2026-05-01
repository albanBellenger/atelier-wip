import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { AttentionItem, AttentionKind, AuthErrorBody } from '../../services/api'
import { getProjectAttention } from '../../services/api'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'

export type NeedsAttentionFilter = 'all' | AttentionKind

export type NeedsAttentionCardProps = {
  studioId: string
  softwareId: string
  projectId: string
}

function pillTone(kind: AttentionKind): string {
  switch (kind) {
    case 'conflict':
      return 'border-red-500/50 text-red-300'
    case 'drift':
      return 'border-amber-500/50 text-amber-300'
    case 'gap':
      return 'border-violet-500/50 text-violet-300'
    case 'update':
      return 'border-emerald-500/50 text-emerald-300'
  }
}

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

export function NeedsAttentionCard({
  studioId,
  softwareId,
  projectId,
}: NeedsAttentionCardProps): ReactElement {
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
          <ul className="divide-y divide-zinc-800/90">
            {filtered.map((item) => (
              <li key={item.id} className="flex gap-3 py-4 first:pt-0">
                <div className="shrink-0 pt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${pillTone(item.kind)}`}
                  >
                    {pillLabel(item.kind)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to={rowHref(studioId, softwareId, projectId, item)}
                    className="group block text-left"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-[13px] text-zinc-100 group-hover:text-violet-300">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-500">
                        {formatRelativeTimeUtc(item.occurred_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{item.subtitle}</p>
                    <p className="mt-1 text-[12px] leading-snug text-zinc-400">
                      {item.description}
                    </p>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
