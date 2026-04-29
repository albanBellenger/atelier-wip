import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  createProject,
  deleteSoftware,
  getSoftware,
  listProjects,
  me,
  testGitConnection,
  updateSoftware,
} from '../services/api'

export function SoftwarePage(): ReactElement {
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

  const access = useStudioAccess(profile, sid)

  const swQ = useQuery({
    queryKey: ['softwareOne', sid, sfid],
    queryFn: () => getSoftware(sid, sfid),
    enabled: Boolean(sid && sfid && access.isMember),
  })

  const projectsQ = useQuery({
    queryKey: ['projects', sfid],
    queryFn: () => listProjects(sfid),
    enabled: Boolean(sfid && access.isMember),
  })

  const [projectName, setProjectName] = useState('')
  const createProjectMut = useMutation({
    mutationFn: () =>
      createProject(sfid, {
        name: projectName.trim() || 'Untitled project',
      }),
    onSuccess: () => {
      setProjectName('')
      void qc.invalidateQueries({ queryKey: ['projects', sfid] })
    },
  })

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
      setGitTokenInput('')
      setMsg('Saved.')
    },
  })

  const testMut = useMutation({
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

  if (profilePending) {
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
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          <Link
            to={`/studios/${sid}`}
            className="text-violet-400 hover:underline"
          >
            ← Studio
          </Link>
          <Link to="/studios" className="text-zinc-500 hover:text-zinc-300">
            All studios
          </Link>
        </div>

        {swQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {swQ.isError && (
          <p className="text-red-400">Could not load software.</p>
        )}

        {swQ.data && (
          <>
            <h1 className="text-2xl font-semibold">{swQ.data.name}</h1>
            {msg && <p className="mt-2 text-sm text-emerald-400">{msg}</p>}

            <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">Projects</h2>
              {access.isMember && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Project name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        createProjectMut.mutate()
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={createProjectMut.isPending}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                    onClick={() => createProjectMut.mutate()}
                  >
                    New project
                  </button>
                </div>
              )}
              {projectsQ.isPending && (
                <p className="mt-3 text-sm text-zinc-500">Loading projects…</p>
              )}
              {projectsQ.data && projectsQ.data.length === 0 && (
                <p className="mt-3 text-sm text-zinc-500">No projects yet.</p>
              )}
              {projectsQ.data && projectsQ.data.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {projectsQ.data.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/studios/${sid}/software/${sfid}/projects/${p.id}`}
                        className="text-violet-400 hover:underline"
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

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

            <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">
                GitLab integration
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
