import type { ReactElement } from 'react'

import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import type { EmbeddingStatus } from '../../services/api'

const STATUS_META: Record<
  EmbeddingStatus,
  { label: string; pillClass: string; tooltip: string }
> = {
  embedded: {
    label: 'Indexed',
    pillClass: 'border-emerald-600/50 bg-emerald-950/60 text-emerald-200',
    tooltip: '',
  },
  pending: {
    label: 'Indexing…',
    pillClass: 'border-amber-600/40 bg-amber-950/50 text-amber-200',
    tooltip: 'Embedding in progress',
  },
  failed: {
    label: 'Index failed',
    pillClass: 'border-red-600/50 bg-red-950/60 text-red-200',
    tooltip: 'Could not index — see details',
  },
  skipped: {
    label: 'Not indexed',
    pillClass: 'border-zinc-600/50 bg-zinc-900/80 text-zinc-400',
    tooltip: 'Embedding not configured at upload time',
  },
}

export function EmbeddingStatusBadge(props: {
  status?: EmbeddingStatus | null
  embeddedAt?: string | null
  chunkCount?: number | null
}): ReactElement | null {
  const { status, embeddedAt, chunkCount } = props
  if (status == null) {
    return null
  }
  const meta = STATUS_META[status]
  let title = meta.tooltip || meta.label
  if (status === 'embedded') {
    const when =
      embeddedAt != null
        ? formatRelativeTimeUtc(embeddedAt) ||
          new Date(embeddedAt).toLocaleString()
        : null
    const chunkPart =
      chunkCount != null
        ? `${chunkCount} chunk${chunkCount === 1 ? '' : 's'}`
        : null
    const parts = [chunkPart, when ? `indexed ${when}` : null].filter(Boolean)
    title = parts.length > 0 ? parts.join(' · ') : 'Indexed'
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.pillClass}`}
    >
      {meta.label}
    </span>
  )
}

/** Shown when embedding finished but no chunks were produced (empty extract). */
export function RagEmptyExtractWarning(): ReactElement {
  return (
    <span
      title="No text could be extracted from this file — RAG cannot use it."
      className="inline-flex shrink-0 text-amber-400"
      aria-label="No extractable text for RAG"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </span>
  )
}
