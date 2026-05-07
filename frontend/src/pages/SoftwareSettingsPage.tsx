import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { ArtifactExclusionPanel } from '../components/software/ArtifactExclusionPanel'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  deleteSoftware,
  getSoftware,
  listSoftware,
  listSoftwareArtifacts,
  logout as logoutApi,
  me,
  patchSoftwareArtifactExclusion,
  testGitConnection,
  updateSoftware,
} from '../services/api'

function softwareSettingsPageIntroHelp(softwareName: string): string {
  return `Name, description, LLM context, and GitLab connection for ${softwareName}.`
}

export function SoftwareSettingsPage(): ReactElement {
  const { studioId, softwareId } = useParams<{
    studioId: string
    softwareId: string
  }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''

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

  const access = useStudioAccess(profile, sid, sfid)

  const swQ = useQuery({
    queryKey: ['softwareOne', sid, sfid],
    queryFn: () => getSoftware(sid, sfid),
    enabled: Boolean(sid && sfid && access.isMember),
  })

  const studioSoftwareListQ = useQuery({
    queryKey: ['software', sid],
    queryFn: () => listSoftware(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const artifactsQ = useQuery({
    queryKey: ['software', sfid, 'artifacts', 'settings'],
    queryFn: () => listSoftwareArtifacts(sfid),
    enabled: Boolean(sfid && access.isMember),
  })

  const [savingArtifactId, setSavingArtifactId] = useState<string | null>(null)
  const patchSoftwareExclusionMut = useMutation({
    mutationFn: ({
      artifactId,
      excluded,
    }: {
      artifactId: string
      excluded: boolean
    }) =>
      patchSoftwareArtifactExclusion(sid, sfid, {
        artifact_id: artifactId,
        excluded,
      }),
    onMutate: ({ artifactId }) => {
      setSavingArtifactId(artifactId)
    },
    onSettled: () => {
      setSavingArtifactId(null)
      void qc.invalidateQueries({ queryKey: ['software', sfid, 'artifacts'] })
    },
  })

  const headerTrailingCrumb = useMemo(() => {
    if (!swQ.data) return undefined
    const rows = studioSoftwareListQ.data ?? []
    const base = {
      label: swQ.data.name,
      softwareId: sfid,
      projectLabel: 'Software settings',
    }
    if (rows.length <= 1) return base
    return {
      ...base,
      softwareSwitcher: {
        currentSoftwareId: sfid,
        softwareOptions: rows.map((r) => ({ id: r.id, name: r.name })),
        onSoftwareSelect: (nextId: string) => {
          void navigate(`/studios/${sid}/software/${nextId}/settings`)
        },
      },
    }
  }, [swQ.data, studioSoftwareListQ.data, sfid, sid, navigate])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [definition, setDefinition] = useState('')
  const [gitRepoUrl, setGitRepoUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitTokenInput, setGitTokenInput] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [gitMsg, setGitMsg] = useState<string | null>(null)

  const [formSyncKey, setFormSyncKey] = useState('')
  const sw = swQ.data
  const serverSyncKey = sw ? `${sw.id}:${sw.updated_at ?? ''}` : ''
  if (sw && serverSyncKey !== formSyncKey) {
    setFormSyncKey(serverSyncKey)
    setName(sw.name)
    setDescription(sw.description ?? '')
    setDefinition(sw.definition ?? '')
    setGitRepoUrl(sw.git_repo_url ?? '')
    setGitBranch(sw.git_branch ?? 'main')
    setGitTokenInput('')
  }

  const saveMut = useMutation({
    mutationFn: () =>
      updateSoftware(sid, sfid, {
        name: name.trim(),
        description: description.trim() || null,
        definition: definition || null,
        git_repo_url: gitRepoUrl.trim() || null,
        git_branch: gitBranch.trim() || null,
        git_token:
          gitTokenInput.trim() === ''
            ? undefined
            : gitTokenInput.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['softwareOne', sid, sfid] })
      void qc.invalidateQueries({ queryKey: ['software', sid] })
      void qc.invalidateQueries({ queryKey: ['gitHistory', sid, sfid] })
      setGitTokenInput('')
      setMsg('Saved.')
    },
  })

  const testMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: () => testGitConnection(sid, sfid),
    onSuccess: (r) => {
      setGitMsg(r.ok ? `OK: ${r.message}` : `Failed: ${r.message}`)
    },
    onError: (e: unknown) => {
      const x = e as { detail?: string }
      setGitMsg(typeof x.detail === 'string' ? x.detail : 'Test failed')
    },
  })

  const delMut = useMutation({
    mutationFn: () => deleteSoftware(sid, sfid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['software', sid] })
      navigate(`/studios/${sid}`)
    },
  })

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

  const handleStudioChange = useCallback(
    (nextStudioId: string) => {
      void navigate(`/studios/${nextStudioId}`)
    },
    [navigate],
  )

  if (!sid || !sfid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (profilePending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember && profile) {
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
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={headerTrailingCrumb}
        />

        {swQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {swQ.isError && (
          <p className="text-red-400">Could not load software.</p>
        )}

        {swQ.data && (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
                Software settings
              </h1>
              <button
                type="button"
                className="inline-flex shrink-0 cursor-help items-baseline justify-center rounded px-0.5 text-[13px] font-semibold leading-none text-zinc-500 transition hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                aria-label={softwareSettingsPageIntroHelp(swQ.data.name)}
                title={softwareSettingsPageIntroHelp(swQ.data.name)}
              >
                <span aria-hidden="true">?</span>
              </button>
            </div>

            {msg ? <p className="mt-4 text-sm text-emerald-400">{msg}</p> : null}

            <div className="mt-8 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">Details</h2>
              {access.isStudioAdmin ? (
                <>
                  <input
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Software definition (LLM context)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
                      rows={8}
                      value={definition}
                      onChange={(e) => setDefinition(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saveMut.isPending}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                    onClick={() => saveMut.mutate()}
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <p className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                    {name}
                  </p>
                  <p className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm whitespace-pre-wrap">
                    {description}
                  </p>
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">
                      Software definition (LLM context)
                    </p>
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 font-mono text-sm whitespace-pre-wrap">
                      {definition}
                    </div>
                  </div>
                </>
              )}
            </div>

            <ArtifactExclusionPanel
              title="Artifact visibility (software scope)"
              description="Excluded files remain in their projects but are omitted from software-wide views and inherited context where supported."
              rows={artifactsQ.data ?? []}
              isPending={artifactsQ.isPending}
              isError={artifactsQ.isError}
              mode="software"
              canEdit={access.isStudioEditor && !access.isCrossStudioViewer}
              isSavingId={savingArtifactId}
              onToggleExcluded={(artifactId, nextExcluded) => {
                patchSoftwareExclusionMut.mutate({
                  artifactId,
                  excluded: nextExcluded,
                })
              }}
            />

            <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">
                Self-hosted GitLab integration
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Token is stored encrypted. Leave token blank to keep the current
                secret.
                {swQ.data.git_token_set && (
                  <span className="text-emerald-500"> A token is on file.</span>
                )}
              </p>
              {access.isStudioAdmin ? (
                <>
                  <input
                    className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Repository URL (https://gitlab.example.com/group/repo)"
                    value={gitRepoUrl}
                    onChange={(e) => setGitRepoUrl(e.target.value)}
                  />
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Branch"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                  />
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    type="password"
                    placeholder="Personal access token (optional update)"
                    autoComplete="off"
                    value={gitTokenInput}
                    onChange={(e) => setGitTokenInput(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <p className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                    {gitRepoUrl || '—'}
                  </p>
                  <p className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                    {gitBranch || '—'}
                  </p>
                  <p className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-500">
                    {swQ.data.git_token_set
                      ? 'A token is on file.'
                      : 'No token on file.'}
                  </p>
                </>
              )}
              {access.isStudioAdmin && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-lg bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
                    disabled={saveMut.isPending}
                    onClick={() => saveMut.mutate()}
                  >
                    Save Git settings
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800"
                    disabled={testMut.isPending}
                    onClick={() => testMut.mutate()}
                  >
                    Test connection
                  </button>
                </div>
              )}
              {gitMsg && (
                <p className="mt-3 text-sm text-zinc-400">{gitMsg}</p>
              )}
            </section>

            {access.isStudioAdmin && (
              <div className="mt-12 border-t border-zinc-800 pt-8">
                <button
                  type="button"
                  className="text-sm text-red-400 hover:underline"
                  onClick={() => {
                    if (
                      confirm(
                        'Delete this software and all related projects and data?',
                      )
                    )
                      delMut.mutate()
                  }}
                >
                  Delete software
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
