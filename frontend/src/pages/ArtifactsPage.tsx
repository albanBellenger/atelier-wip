import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  type AuthErrorBody,
  createMarkdownArtifact,
  deleteArtifact,
  downloadArtifactBlob,
  listArtifacts,
  me,
  uploadArtifact,
} from '../services/api'

function formatApiDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') return d
  }
  return 'Request failed.'
}

export function ArtifactsPage(): ReactElement {
  const { studioId, softwareId, projectId } = useParams<{
    studioId: string
    softwareId: string
    projectId: string
  }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const pid = projectId ?? ''

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

  const access = useStudioAccess(profile, sid)

  const artifactsQ = useQuery({
    queryKey: ['artifacts', pid],
    queryFn: () => listArtifacts(pid),
    enabled: Boolean(pid && access.isMember),
  })

  const [uploadName, setUploadName] = useState('')
  const [mdName, setMdName] = useState('')
  const [mdBody, setMdBody] = useState('')
  const [showMdForm, setShowMdForm] = useState(false)

  const uploadMut = useMutation({
    mutationFn: (file: File) =>
      uploadArtifact(pid, file, uploadName.trim() || undefined),
    onSuccess: () => {
      setUploadName('')
      void qc.invalidateQueries({ queryKey: ['artifacts', pid] })
    },
  })

  const mdMut = useMutation({
    mutationFn: () =>
      createMarkdownArtifact(pid, {
        name: mdName.trim() || 'Untitled.md',
        content: mdBody,
      }),
    onSuccess: () => {
      setMdName('')
      setMdBody('')
      setShowMdForm(false)
      void qc.invalidateQueries({ queryKey: ['artifacts', pid] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (artifactId: string) => deleteArtifact(pid, artifactId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['artifacts', pid] })
    },
  })

  async function handleDownload(
    artifactId: string,
    filename: string,
  ): Promise<void> {
    try {
      const blob = await downloadArtifactBlob(pid, artifactId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'download'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* keep minimal */
    }
  }

  if (!sid || !sfid || !pid) {
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
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          <Link
            to={`/studios/${sid}/software/${sfid}/projects/${pid}`}
            className="text-violet-400 hover:underline"
          >
            ← Project
          </Link>
          <Link
            to={`/studios/${sid}/software/${sfid}`}
            className="text-zinc-500 hover:text-zinc-300"
          >
            Software
          </Link>
        </div>

        <h1 className="text-2xl font-semibold">Artifacts</h1>
        <p className="mt-2 text-sm text-zinc-400">
          PDF and Markdown files for this project. Upload requires embedding to be
          configured by a Tool Admin.
        </p>

        <section className="mt-8 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-medium text-zinc-300">Upload</h2>
          <input
            type="text"
            className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            placeholder="Display name (optional)"
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
          />
          <input
            type="file"
            accept=".pdf,.md,application/pdf,text/markdown"
            className="block text-sm text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-white"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                uploadMut.mutate(f)
                e.target.value = ''
              }
            }}
            disabled={uploadMut.isPending}
          />
          {uploadMut.isError && (
            <p className="whitespace-pre-wrap text-sm text-red-400">
              {formatApiDetail(uploadMut.error)}
            </p>
          )}
        </section>

        <section className="mt-6 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-zinc-300">
              New Markdown artifact
            </h2>
            <button
              type="button"
              className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => setShowMdForm((v) => !v)}
            >
              {showMdForm ? 'Hide' : 'Create'}
            </button>
          </div>
          {showMdForm && (
            <>
              <input
                type="text"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Name"
                value={mdName}
                onChange={(e) => setMdName(e.target.value)}
              />
              <textarea
                className="min-h-[160px] w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
                placeholder="Markdown content"
                value={mdBody}
                onChange={(e) => setMdBody(e.target.value)}
              />
              <button
                type="button"
                disabled={mdMut.isPending}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                onClick={() => mdMut.mutate()}
              >
                Save Markdown artifact
              </button>
              {mdMut.isError && (
                <p className="whitespace-pre-wrap text-sm text-red-400">
                  {formatApiDetail(mdMut.error)}
                </p>
              )}
            </>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Library</h2>
          {artifactsQ.isPending && <p className="text-zinc-500">Loading…</p>}
          {artifactsQ.isError && (
            <p className="text-red-400">Could not load artifacts.</p>
          )}
          {artifactsQ.data?.length === 0 && (
            <p className="text-sm text-zinc-500">No artifacts yet.</p>
          )}
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
            {artifactsQ.data?.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-zinc-200">{a.name}</span>
                  <span className="ml-2 text-xs uppercase text-zinc-500">
                    {a.file_type}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-violet-400 hover:underline"
                    onClick={() => void handleDownload(a.id, a.name)}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="text-red-400 hover:underline disabled:opacity-40"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete “${a.name}”?`)) {
                        deleteMut.mutate(a.id)
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
