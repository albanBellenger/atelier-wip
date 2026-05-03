import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { ArtifactDetailDrawer } from '../components/artifacts/ArtifactDetailDrawer'
import {
  EmbeddingStatusBadge,
  RagEmptyExtractWarning,
} from '../components/artifacts/EmbeddingStatusBadge'
import { ArtifactScopeBadge } from '../components/software/ArtifactScopeBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/ListSkeleton'
import { formatFileByteSize } from '../lib/formatFileByteSize'
import { formatPersonShortLabel } from '../lib/formatPersonShortLabel'
import { formatRelativeTimeUtc } from '../lib/formatRelativeTime'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { APP_VERSION } from '../version'
import {
  type AuthErrorBody,
  createMarkdownArtifact,
  createSoftwareMarkdownArtifact,
  createStudioMarkdownArtifact,
  downloadArtifactBlobById,
  listArtifactLibrary,
  listSoftware,
  listStudioProjects,
  logout as logoutApi,
  me,
  uploadArtifact,
  uploadSoftwareArtifact,
  uploadStudioArtifact,
} from '../services/api'

function formatApiDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') return d
  }
  return 'Request failed.'
}

type UploadTarget = 'studio' | 'software' | 'project'

function artifactTypeBadgeClass(fileType: string): string {
  const ft = fileType.toLowerCase()
  if (ft === 'pdf') {
    return 'border border-red-500/40 bg-red-950/70 text-red-200'
  }
  return 'border border-teal-500/40 bg-teal-950/55 text-teal-200'
}

function rowOriginLabel(
  scope: string | undefined,
  row: {
    project_name: string | null
    software_name: string | null
  },
): string {
  const s = scope ?? 'project'
  if (s === 'studio') return 'Studio library'
  if (s === 'software') return 'Software library'
  return row.project_name ?? 'Project'
}

export function ArtifactLibraryPage(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''
  const urlSoftwareFilter =
    searchParams.get('softwareId')?.trim() || undefined

  const hostedEnv = getHostedEnvironment()
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)

  const {
    data: profile,
    isPending: profilePending,
    isError: profileError,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileError, navigate])

  const access = useStudioAccess(profile, sid, urlSoftwareFilter)

  const softwareQ = useQuery({
    queryKey: ['software', sid],
    queryFn: () => listSoftware(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const studioProjectsQ = useQuery({
    queryKey: ['studio', sid, 'projects'],
    queryFn: () => listStudioProjects(sid, { includeArchived: false }),
    enabled: Boolean(sid && access.isMember),
    retry: false,
  })

  const [drawer, setDrawer] = useState<{
    artifactId: string
    projectId: string | null
  } | null>(null)

  const libraryQ = useQuery({
    queryKey: ['artifactLibrary', sid, urlSoftwareFilter ?? ''],
    queryFn: () =>
      listArtifactLibrary(sid, { softwareId: urlSoftwareFilter }),
    enabled: Boolean(sid && access.isMember),
    refetchInterval: (q) => {
      const rows = q.state.data
      if (!rows?.length) {
        return false
      }
      return rows.some((r) => r.embedding_status === 'pending') ? 5000 : false
    },
  })

  const handleStudioChange = useCallback(
    (nextStudioId: string) => {
      void navigate(`/studios/${nextStudioId}/artifact-library`)
    },
    [navigate],
  )

  const handleLogout = useCallback(async () => {
    await logoutApi()
    void qc.clear()
    void navigate('/auth', { replace: true })
  }, [navigate, qc])

  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('studio')
  const [uploadSoftwareId, setUploadSoftwareId] = useState('')
  const [uploadProjectId, setUploadProjectId] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [mdName, setMdName] = useState('')
  const [mdBody, setMdBody] = useState('')
  const [showMdForm, setShowMdForm] = useState(false)

  useEffect(() => {
    if (urlSoftwareFilter) {
      setUploadSoftwareId(urlSoftwareFilter)
    }
  }, [urlSoftwareFilter])

  const softwareOptions = softwareQ.data ?? []
  const effectiveUploadSoftwareId = useMemo(() => {
    if (uploadSoftwareId.trim()) return uploadSoftwareId.trim()
    const first = softwareOptions[0]?.id
    return first ?? ''
  }, [uploadSoftwareId, softwareOptions])

  const invalidateLibrary = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['artifactLibrary', sid] })
    void qc.invalidateQueries({ queryKey: ['studio', sid, 'artifacts'] })
    void qc.invalidateQueries({ queryKey: ['software'] })
  }, [qc, sid])

  const uploadStudioMut = useMutation({
    mutationFn: (file: File) =>
      uploadStudioArtifact(sid, file, uploadName.trim() || undefined),
    onSuccess: () => {
      setUploadName('')
      invalidateLibrary()
    },
  })

  const uploadSoftwareMut = useMutation({
    mutationFn: (file: File) =>
      uploadSoftwareArtifact(
        effectiveUploadSoftwareId,
        file,
        uploadName.trim() || undefined,
      ),
    onSuccess: () => {
      setUploadName('')
      invalidateLibrary()
    },
  })

  const uploadProjectMut = useMutation({
    mutationFn: (file: File) =>
      uploadArtifact(uploadProjectId, file, uploadName.trim() || undefined),
    onSuccess: () => {
      setUploadName('')
      invalidateLibrary()
    },
  })

  const mdStudioMut = useMutation({
    mutationFn: () =>
      createStudioMarkdownArtifact(sid, {
        name: mdName.trim() || 'Untitled.md',
        content: mdBody,
      }),
    onSuccess: () => {
      setMdName('')
      setMdBody('')
      setShowMdForm(false)
      invalidateLibrary()
    },
  })

  const mdSoftwareMut = useMutation({
    mutationFn: () =>
      createSoftwareMarkdownArtifact(effectiveUploadSoftwareId, {
        name: mdName.trim() || 'Untitled.md',
        content: mdBody,
      }),
    onSuccess: () => {
      setMdName('')
      setMdBody('')
      setShowMdForm(false)
      invalidateLibrary()
    },
  })

  const mdProjectMut = useMutation({
    mutationFn: () =>
      createMarkdownArtifact(uploadProjectId, {
        name: mdName.trim() || 'Untitled.md',
        content: mdBody,
      }),
    onSuccess: () => {
      setMdName('')
      setMdBody('')
      setShowMdForm(false)
      invalidateLibrary()
    },
  })

  const handleDownload = useCallback(
    async (artifactId: string, filename: string) => {
      try {
        const blob = await downloadArtifactBlobById(artifactId)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || 'download'
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        /* minimal */
      }
    },
    [],
  )

  const setSoftwareFilter = useCallback(
    (next: string | undefined) => {
      const sp = new URLSearchParams(searchParams)
      if (next && next.trim()) {
        sp.set('softwareId', next.trim())
      } else {
        sp.delete('softwareId')
      }
      setSearchParams(sp, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const headerTrailingCrumb = { projectLabel: 'Artifact library' }

  if (!sid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileError || profilePending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>No access.</p>
        <Link to="/studios" className="mt-4 inline-block text-violet-400">
          Back to studios
        </Link>
      </div>
    )
  }

  const canUpload = access.isStudioEditor && !access.isCrossStudioViewer
  const canSeeChunkPreviews = canUpload
  const uploadPending =
    uploadStudioMut.isPending ||
    uploadSoftwareMut.isPending ||
    uploadProjectMut.isPending
  const mdPending =
    mdStudioMut.isPending || mdSoftwareMut.isPending || mdProjectMut.isPending

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[960px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={headerTrailingCrumb}
        />

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Artifact library
            </h1>
            <p className="mt-2 max-w-xl text-[13px] text-zinc-400">
              Studio, software, and project files in one place. Filter by
              software or upload to the scope you need.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            <span className="font-medium text-zinc-400">Filter by software</span>
            <select
              className="min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={urlSoftwareFilter ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setSoftwareFilter(v || undefined)
              }}
            >
              <option value="">All software</option>
              {softwareOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canUpload ? (
          <section className="mt-8 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-medium text-zinc-300">Upload</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['studio', 'Studio'],
                  ['software', 'Software'],
                  ['project', 'Project'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    uploadTarget === key
                      ? 'bg-violet-600 text-white'
                      : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  }`}
                  onClick={() => setUploadTarget(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {uploadTarget === 'software' ? (
              <label className="block text-[11px] text-zinc-500">
                Software
                <select
                  className="mt-1 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  value={effectiveUploadSoftwareId}
                  onChange={(e) => setUploadSoftwareId(e.target.value)}
                >
                  {softwareOptions.length === 0 ? (
                    <option value="">No software</option>
                  ) : null}
                  {softwareOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {uploadTarget === 'project' ? (
              <label className="block text-[11px] text-zinc-500">
                Project
                <select
                  className="mt-1 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  value={uploadProjectId}
                  onChange={(e) => setUploadProjectId(e.target.value)}
                >
                  <option value="">Select a project…</option>
                  {(studioProjectsQ.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.software_name} / {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <input
              type="text"
              className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="Display name (optional)"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
            />
            <input
              type="file"
              accept=".pdf,.md,application/pdf,text/markdown"
              className="block text-sm text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-white"
              disabled={
                uploadPending ||
                (uploadTarget === 'software' && !effectiveUploadSoftwareId) ||
                (uploadTarget === 'project' && !uploadProjectId)
              }
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (uploadTarget === 'studio') {
                  uploadStudioMut.mutate(f)
                } else if (uploadTarget === 'software') {
                  uploadSoftwareMut.mutate(f)
                } else {
                  uploadProjectMut.mutate(f)
                }
                e.target.value = ''
              }}
            />
            {(uploadStudioMut.isError ||
              uploadSoftwareMut.isError ||
              uploadProjectMut.isError) && (
              <p className="text-sm text-red-400">
                {formatApiDetail(
                  uploadStudioMut.error ??
                    uploadSoftwareMut.error ??
                    uploadProjectMut.error,
                )}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 pt-2">
              <h3 className="text-xs font-medium text-zinc-400">
                New Markdown artifact
              </h3>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                onClick={() => setShowMdForm((v) => !v)}
              >
                {showMdForm ? 'Hide' : 'Create'}
              </button>
            </div>
            {showMdForm ? (
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <input
                  type="text"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                  placeholder="Name"
                  value={mdName}
                  onChange={(e) => setMdName(e.target.value)}
                />
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
                  placeholder="Markdown content"
                  value={mdBody}
                  onChange={(e) => setMdBody(e.target.value)}
                />
                <button
                  type="button"
                  disabled={
                    mdPending ||
                    (uploadTarget === 'software' &&
                      !effectiveUploadSoftwareId) ||
                    (uploadTarget === 'project' && !uploadProjectId)
                  }
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
                  onClick={() => {
                    if (uploadTarget === 'studio') {
                      mdStudioMut.mutate()
                    } else if (uploadTarget === 'software') {
                      mdSoftwareMut.mutate()
                    } else {
                      mdProjectMut.mutate()
                    }
                  }}
                >
                  Save Markdown
                </button>
                {(mdStudioMut.isError ||
                  mdSoftwareMut.isError ||
                  mdProjectMut.isError) && (
                  <p className="text-sm text-red-400">
                    {formatApiDetail(
                      mdStudioMut.error ??
                        mdSoftwareMut.error ??
                        mdProjectMut.error,
                    )}
                  </p>
                )}
              </div>
            ) : null}
          </section>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            View only — uploads require studio editor access.
          </p>
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">All files</h2>
          {libraryQ.isPending ? <ListSkeleton rows={4} /> : null}
          {libraryQ.isError ? (
            <p className="text-red-400">Could not load artifact library.</p>
          ) : null}
          {!libraryQ.isPending &&
            !libraryQ.isError &&
            (libraryQ.data?.length ?? 0) === 0 && (
              <EmptyState
                title="No artifacts yet"
                description="Upload from this page or from a project’s artifact tools."
              />
            )}
          {!libraryQ.isPending &&
            !libraryQ.isError &&
            libraryQ.data &&
            libraryQ.data.length > 0 && (
              <ul className="divide-y divide-zinc-800/90 rounded-2xl border border-zinc-800 bg-zinc-900/40">
                {libraryQ.data.map((row) => {
                  const scopeLevel = row.scope_level ?? 'project'
                  const when =
                    formatRelativeTimeUtc(row.created_at) ||
                    new Date(row.created_at).toLocaleDateString()
                  const uploader = formatPersonShortLabel(
                    row.uploaded_by_display,
                  )
                  const origin = rowOriginLabel(scopeLevel, row)
                  const swLabel = row.software_name ?? '—'
                  const metaParts = [swLabel, origin, uploader, when]
                  return (
                    <li key={row.id} className="px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 sm:flex-row sm:items-center sm:gap-6"
                          onClick={() =>
                            setDrawer({
                              artifactId: row.id,
                              projectId: row.project_id,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setDrawer({
                                artifactId: row.id,
                                projectId: row.project_id,
                              })
                            }
                          }}
                        >
                          <div className="flex min-w-0 flex-1 gap-3">
                            <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                              <ArtifactScopeBadge level={scopeLevel} />
                              <span
                                className={`inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${artifactTypeBadgeClass(row.file_type)}`}
                              >
                                {row.file_type.toUpperCase()}
                              </span>
                              <EmbeddingStatusBadge
                                status={row.embedding_status ?? undefined}
                                embeddedAt={row.embedded_at}
                                chunkCount={row.chunk_count}
                              />
                              {row.embedding_status === 'embedded' &&
                              row.chunk_count === 0 ? (
                                <RagEmptyExtractWarning />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <span className="truncate text-[14px] font-medium text-zinc-100">
                                  {row.name}
                                </span>
                                <span className="shrink-0 tabular-nums text-[12px] text-zinc-500">
                                  {formatFileByteSize(row.size_bytes ?? 0)}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-zinc-500">
                                {metaParts.join(' · ')}
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 self-start text-[12px] font-medium text-violet-400 hover:underline sm:self-center"
                          onClick={() =>
                            void handleDownload(row.id, row.name)
                          }
                        >
                          Download
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
        </section>

        <ArtifactDetailDrawer
          isOpen={drawer != null}
          onClose={() => setDrawer(null)}
          projectId={drawer?.projectId ?? null}
          artifactId={drawer?.artifactId ?? null}
          canSeeChunkPreviews={canSeeChunkPreviews}
          canReindexArtifact={access.isStudioEditor}
          canDeleteArtifact={access.isStudioAdmin}
          canConfigureChunking={access.isStudioAdmin}
        />

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
          <span>Atelier · {hostedEnvLabel}</span>
          <span className="font-mono">v{APP_VERSION}</span>
        </footer>
      </div>
    </div>
  )
}
