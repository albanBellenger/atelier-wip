import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import { formatFileByteSize } from '../../lib/formatFileByteSize'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import {
  type ArtifactDetail,
  getArtifactDetail,
  getArtifactDetailById,
} from '../../services/api'
import { EmbeddingStatusBadge } from './EmbeddingStatusBadge'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatRelativeTimeUtc(iso) || new Date(iso).toLocaleString()
}

export function ArtifactDetailDrawer(props: {
  isOpen: boolean
  onClose: () => void
  projectId: string | null
  artifactId: string | null
  canSeeChunkPreviews: boolean
}): ReactElement | null {
  const { isOpen, onClose, projectId, artifactId, canSeeChunkPreviews } = props

  const detailQ = useQuery({
    queryKey: ['artifactDetail', projectId ?? '', artifactId ?? ''],
    queryFn: async (): Promise<ArtifactDetail> => {
      if (artifactId == null || artifactId === '') {
        throw new Error('missing artifact')
      }
      if (projectId != null && projectId !== '') {
        return getArtifactDetail(projectId, artifactId)
      }
      return getArtifactDetailById(artifactId)
    },
    enabled: Boolean(isOpen && artifactId),
  })

  if (!isOpen) {
    return null
  }

  const d: ArtifactDetail | undefined = detailQ.data

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">Artifact details</h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-zinc-200">
          {detailQ.isPending ? <p className="text-zinc-500">Loading…</p> : null}
          {detailQ.isError ? (
            <p className="text-red-400">Could not load details.</p>
          ) : null}
          {d ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase text-zinc-500">Name</p>
                <p className="mt-1 font-medium text-zinc-100">{d.name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
                  {d.scope_level}
                </span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
                  {d.file_type.toUpperCase()}
                </span>
                <EmbeddingStatusBadge
                  status={d.embedding_status ?? undefined}
                  embeddedAt={d.embedded_at}
                  chunkCount={d.chunk_count}
                />
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <dt className="text-zinc-500">Size</dt>
                <dd>{formatFileByteSize(d.size_bytes)}</dd>
                <dt className="text-zinc-500">Uploaded</dt>
                <dd>{formatWhen(d.created_at)}</dd>
                <dt className="text-zinc-500">Embedded</dt>
                <dd>{formatWhen(d.embedded_at)}</dd>
                <dt className="text-zinc-500">Chunks</dt>
                <dd>{d.chunk_count ?? '—'}</dd>
                <dt className="text-zinc-500">Extracted chars</dt>
                <dd>{d.extracted_char_count ?? '—'}</dd>
              </dl>
              {d.embedding_error ? (
                <div>
                  <p className="text-xs uppercase text-red-400">Indexing error</p>
                  <pre className="mt-1 overflow-x-auto rounded border border-red-900/50 bg-red-950/30 p-2 text-xs text-red-100">
                    {d.embedding_error}
                  </pre>
                </div>
              ) : null}
              {canSeeChunkPreviews && d.chunk_previews.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    First chunks
                  </h3>
                  <ul className="mt-2 space-y-3">
                    {d.chunk_previews.map((c) => (
                      <li
                        key={c.chunk_index}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2"
                      >
                        <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                          <span>index {c.chunk_index}</span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                            {c.content_length} chars
                          </span>
                        </div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-200">
                          {c.content}
                        </pre>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
