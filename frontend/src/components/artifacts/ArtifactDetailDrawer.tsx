import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

import { formatFileByteSize } from '../../lib/formatFileByteSize'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import {
  type ArtifactDetail,
  type ArtifactScopeLevel,
  deleteArtifactById,
  getArtifactDetail,
  getArtifactDetailById,
  listArtifactChunkingStrategies,
  listSoftware,
  listStudioProjects,
  patchArtifactChunkingStrategy,
  patchArtifactScope,
  reindexArtifactById,
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
  canReindexArtifact: boolean
  canDeleteArtifact: boolean
  canConfigureChunking: boolean
}): ReactElement | null {
  const {
    isOpen,
    onClose,
    projectId,
    artifactId,
    canSeeChunkPreviews,
    canReindexArtifact,
    canDeleteArtifact,
    canConfigureChunking,
  } = props

  const qc = useQueryClient()

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

  const strategiesQ = useQuery({
    queryKey: ['artifactChunkingStrategies'],
    queryFn: () => listArtifactChunkingStrategies(),
    enabled: Boolean(isOpen && artifactId && canConfigureChunking),
  })

  const reindexMut = useMutation({
    mutationFn: () => {
      if (artifactId == null || artifactId === '') {
        throw new Error('missing artifact')
      }
      return reindexArtifactById(artifactId)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['artifactDetail', projectId ?? '', artifactId ?? ''],
      })
      await qc.invalidateQueries({ queryKey: ['artifactLibrary'] })
      await qc.invalidateQueries({ queryKey: ['artifacts'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => {
      if (artifactId == null || artifactId === '') {
        throw new Error('missing artifact')
      }
      return deleteArtifactById(artifactId)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['artifactLibrary'] })
      await qc.invalidateQueries({ queryKey: ['artifacts'] })
      onClose()
    },
  })

  const patchChunkMut = useMutation({
    mutationFn: (next: string | null) => {
      if (artifactId == null || artifactId === '') {
        throw new Error('missing artifact')
      }
      return patchArtifactChunkingStrategy(artifactId, {
        chunking_strategy: next,
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['artifactDetail', projectId ?? '', artifactId ?? ''],
      })
    },
  })

  const studioForLists = detailQ.data?.context_studio_id ?? ''

  const softwareListQ = useQuery({
    queryKey: ['studios', studioForLists, 'software'],
    queryFn: () => listSoftware(studioForLists),
    enabled: Boolean(
      isOpen && artifactId && canDeleteArtifact && studioForLists !== '',
    ),
  })

  const studioProjectsQ = useQuery({
    queryKey: ['studios', studioForLists, 'projects', 'library-scope'],
    queryFn: () =>
      listStudioProjects(studioForLists, { includeArchived: true }),
    enabled: Boolean(
      isOpen && artifactId && canDeleteArtifact && studioForLists !== '',
    ),
  })

  const [scopeLevel, setScopeLevel] = useState<'studio' | 'software' | 'project'>(
    'project',
  )
  const [scopeSoftwareId, setScopeSoftwareId] = useState('')
  const [scopeProjectId, setScopeProjectId] = useState('')

  useEffect(() => {
    const row = detailQ.data
    if (!row) return
    setScopeLevel(row.scope_level)
    setScopeSoftwareId(row.context_software_id ?? '')
    setScopeProjectId(row.project_id ?? '')
  }, [
    detailQ.data?.id,
    detailQ.data?.scope_level,
    detailQ.data?.context_software_id,
    detailQ.data?.project_id,
  ])

  const scopeMut = useMutation({
    mutationFn: (body: {
      scope_level: ArtifactScopeLevel
      software_id?: string | null
      project_id?: string | null
    }) => {
      if (artifactId == null || artifactId === '') {
        throw new Error('missing artifact')
      }
      return patchArtifactScope(artifactId, body)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['artifactDetail', projectId ?? '', artifactId ?? ''],
      })
      await qc.invalidateQueries({ queryKey: ['artifactLibrary'] })
      await qc.invalidateQueries({ queryKey: ['artifacts'] })
    },
  })

  const scopeDirty =
    detailQ.data != null &&
    (scopeLevel !== detailQ.data.scope_level ||
      (scopeLevel === 'software' &&
        scopeSoftwareId !== (detailQ.data.context_software_id ?? '')) ||
      (scopeLevel === 'project' &&
        scopeProjectId !== (detailQ.data.project_id ?? '')))

  const scopeApplyDisabled =
    scopeMut.isPending ||
    !scopeDirty ||
    (scopeLevel === 'software' &&
      (scopeSoftwareId === '' || softwareListQ.isPending)) ||
    (scopeLevel === 'project' &&
      (scopeProjectId === '' || studioProjectsQ.isPending))

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
              {canDeleteArtifact ? (
                <section className="space-y-2 border-t border-zinc-800 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Library scope
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Same studio only. Moves the stored file to the matching library prefix.
                  </p>
                  <label className="block text-[11px] text-zinc-500" htmlFor="artifact-scope-level">
                    Level
                  </label>
                  <select
                    id="artifact-scope-level"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                    value={scopeLevel}
                    onChange={(e) => {
                      const v = e.target.value as 'studio' | 'software' | 'project'
                      setScopeLevel(v)
                    }}
                  >
                    <option value="studio">Studio</option>
                    <option value="software">Software</option>
                    <option value="project">Project</option>
                  </select>
                  {scopeLevel === 'software' ? (
                    <>
                      <label
                        className="mt-2 block text-[11px] text-zinc-500"
                        htmlFor="artifact-scope-sw"
                      >
                        Software
                      </label>
                      <select
                        id="artifact-scope-sw"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                        value={scopeSoftwareId}
                        onChange={(e) => setScopeSoftwareId(e.target.value)}
                        disabled={softwareListQ.isPending}
                      >
                        <option value="">Select software…</option>
                        {(softwareListQ.data ?? []).map((sw) => (
                          <option key={sw.id} value={sw.id}>
                            {sw.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  {scopeLevel === 'project' ? (
                    <>
                      <label
                        className="mt-2 block text-[11px] text-zinc-500"
                        htmlFor="artifact-scope-proj"
                      >
                        Project
                      </label>
                      <select
                        id="artifact-scope-proj"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                        value={scopeProjectId}
                        onChange={(e) => setScopeProjectId(e.target.value)}
                        disabled={studioProjectsQ.isPending}
                      >
                        <option value="">Select project…</option>
                        {(studioProjectsQ.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.software_name} · {p.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-zinc-600 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                    disabled={scopeApplyDisabled}
                    onClick={() => {
                      if (artifactId == null || artifactId === '') return
                      if (scopeLevel === 'studio') {
                        scopeMut.mutate({ scope_level: 'studio' })
                        return
                      }
                      if (scopeLevel === 'software') {
                        scopeMut.mutate({
                          scope_level: 'software',
                          software_id: scopeSoftwareId,
                        })
                        return
                      }
                      scopeMut.mutate({
                        scope_level: 'project',
                        project_id: scopeProjectId,
                      })
                    }}
                  >
                    Apply scope
                  </button>
                  {scopeMut.isError ? (
                    <p className="text-xs text-red-400">Could not update scope.</p>
                  ) : null}
                </section>
              ) : null}
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
                <dt className="text-zinc-500">Chunking</dt>
                <dd className="text-zinc-300">
                  {d.chunking_strategy ?? 'default (fixed window)'}
                </dd>
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
              {canConfigureChunking &&
              strategiesQ.data &&
              artifactId != null &&
              artifactId !== '' ? (
                <section className="space-y-2 border-t border-zinc-800 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Chunking strategy
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Applies on next re-index. Studio owners only.
                  </p>
                  <select
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                    value={d.chunking_strategy ?? 'fixed_window'}
                    disabled={patchChunkMut.isPending}
                    onChange={(e) => {
                      const raw = e.target.value
                      const next = raw === 'fixed_window' ? null : raw
                      patchChunkMut.mutate(next)
                    }}
                  >
                    {strategiesQ.data.strategies.map((s) => (
                      <option key={s} value={s}>
                        {s === 'fixed_window'
                          ? 'default (fixed window)'
                          : s}
                      </option>
                    ))}
                  </select>
                  {patchChunkMut.isError ? (
                    <p className="text-xs text-red-400">Could not update strategy.</p>
                  ) : null}
                </section>
              ) : null}
              {canReindexArtifact && artifactId != null && artifactId !== '' ? (
                <div className="border-t border-zinc-800 pt-4">
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                    disabled={reindexMut.isPending}
                    onClick={() => reindexMut.mutate()}
                  >
                    Re-index for search
                  </button>
                  {reindexMut.isError ? (
                    <p className="mt-2 text-xs text-red-400">Re-index failed.</p>
                  ) : null}
                </div>
              ) : null}
              {canDeleteArtifact && artifactId != null && artifactId !== '' ? (
                <div className="border-t border-zinc-800 pt-4">
                  <button
                    type="button"
                    className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-950/70 disabled:opacity-40"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete “${d.name}”? This cannot be undone.`)) {
                        deleteMut.mutate()
                      }
                    }}
                  >
                    Delete artifact
                  </button>
                  {deleteMut.isError ? (
                    <p className="mt-2 text-xs text-red-400">Delete failed.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
