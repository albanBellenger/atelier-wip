import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { STUDIO_ROLE_OPTIONS, crossStudioAccessLabel, studioRoleLabel } from '../lib/roleLabels'
import {
  addMember,
  createSoftware,
  deleteStudio,
  getStudio,
  listMembers,
  me,
  postStudioCrossStudioRequest,
  removeMember,
  updateMemberRole,
  updateStudio,
  type AuthErrorBody,
} from '../services/api'

function formatApiDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') return d
  }
  return 'Request failed.'
}

export function StudioSettingsPage(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const navigate = useNavigate()
  const sid = studioId ?? ''

  const profileQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileQ.isError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileQ.isError, navigate])

  const access = useStudioAccess(profileQ.data, sid)
  const qc = useQueryClient()

  const studioQ = useQuery({
    queryKey: ['studio', sid],
    queryFn: () => getStudio(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const membersQ = useQuery({
    queryKey: ['members', sid],
    queryFn: () => listMembers(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const [studioName, setStudioName] = useState('')
  const [studioDesc, setStudioDesc] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<
    'studio_admin' | 'studio_member' | 'studio_viewer'
  >('studio_member')
  const [swName, setSwName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const [targetSoftwareId, setTargetSoftwareId] = useState('')
  const [requestedLevel, setRequestedLevel] = useState<'viewer' | 'external_editor'>(
    'viewer',
  )
  const [crossMsg, setCrossMsg] = useState<string | null>(null)

  const updateMut = useMutation({
    mutationFn: () =>
      updateStudio(sid, {
        name: studioName.trim(),
        description: studioDesc.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', sid] })
      setMsg('Saved studio.')
    },
  })

  const addMut = useMutation({
    mutationFn: () =>
      addMember(sid, {
        email: memberEmail.trim(),
        role: memberRole,
      }),
    onSuccess: () => {
      setMemberEmail('')
      void qc.invalidateQueries({ queryKey: ['members', sid] })
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      setMsg('Member added.')
    },
  })

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeMember(sid, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members', sid] })
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      setMsg('Member removed.')
    },
  })

  const roleMut = useMutation({
    mutationFn: (vars: {
      userId: string
      role: 'studio_admin' | 'studio_member' | 'studio_viewer'
    }) => updateMemberRole(sid, vars.userId, vars.role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members', sid] })
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      setMsg('Role updated.')
    },
  })

  const createSwMut = useMutation({
    mutationFn: () => createSoftware(sid, { name: swName.trim() }),
    onSuccess: (newSw) => {
      void qc.invalidateQueries({ queryKey: ['software', sid] })
      void navigate(`/studios/${sid}/software/${newSw.id}`)
      setSwName('')
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteStudio(sid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studios'] })
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      void navigate('/studios')
    },
  })

  useEffect(() => {
    const d = studioQ.data
    if (!d) return
    setStudioName(d.name)
    setStudioDesc(d.description ?? '')
  }, [studioQ.data?.id, studioQ.data?.name, studioQ.data?.description])

  const crossMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: () =>
      postStudioCrossStudioRequest(sid, {
        target_software_id: targetSoftwareId.trim(),
        requested_access_level: requestedLevel,
      }),
    onSuccess: () => {
      setCrossMsg('Request submitted.')
      setTargetSoftwareId('')
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (e: unknown) => {
      setCrossMsg(formatApiDetail(e))
    },
  })

  if (!sid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>You don&apos;t have access to this studio.</p>
        <Link to="/studios" className="mt-4 inline-block text-violet-400">
          Back to studios
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-lg space-y-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link to={`/studios/${sid}`} className="text-sm text-violet-400 hover:underline">
            ← Studio
          </Link>
          <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            Home
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Studio settings</h1>
        {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}

        {access.isStudioAdmin && studioQ.data ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="mb-3 text-sm font-medium text-zinc-300">Studio profile</h2>
            <input
              className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              rows={2}
              placeholder="Description"
              value={studioDesc}
              onChange={(e) => setStudioDesc(e.target.value)}
            />
            <button
              type="button"
              className="mt-3 rounded-lg bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
              onClick={() => updateMut.mutate()}
            >
              Save
            </button>
          </div>
        ) : null}

        <section>
          <h2 className="text-sm font-medium text-zinc-300">Members</h2>
          {membersQ.isPending ? (
            <p className="mt-2 text-sm text-zinc-500">Loading…</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {membersQ.data?.map((m) => (
                <li
                  key={m.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 px-4 py-2 text-sm"
                >
                  <span>
                    {m.display_name}{' '}
                    <span className="text-zinc-500">({m.email})</span> —{' '}
                    <span className="text-zinc-400">{studioRoleLabel(m.role)}</span>
                  </span>
                  {access.isStudioAdmin ? (
                    <span className="flex flex-wrap gap-2">
                      {m.role === 'studio_viewer' ? (
                        <button
                          type="button"
                          className="text-xs text-violet-400 hover:underline"
                          onClick={() =>
                            roleMut.mutate({
                              userId: m.user_id,
                              role: 'studio_member',
                            })
                          }
                        >
                          Make Builder
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-violet-400 hover:underline"
                          onClick={() =>
                            roleMut.mutate({
                              userId: m.user_id,
                              role:
                                m.role === 'studio_admin'
                                  ? 'studio_member'
                                  : 'studio_admin',
                            })
                          }
                        >
                          Toggle Owner
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:underline"
                        onClick={() => {
                          if (confirm(`Remove ${m.email} from this studio?`))
                            removeMut.mutate(m.user_id)
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {access.isStudioAdmin ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="email"
                className="flex-1 min-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="user@example.com"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
              />
              <select
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={memberRole}
                onChange={(e) =>
                  setMemberRole(
                    e.target.value as 'studio_admin' | 'studio_member' | 'studio_viewer',
                  )
                }
              >
                {STUDIO_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.short}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-lg bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
                onClick={() => {
                  if (!memberEmail.trim()) return
                  addMut.mutate()
                }}
              >
                Invite
              </button>
            </div>
          ) : null}
        </section>

        {access.isStudioAdmin ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-medium text-zinc-300">Add software</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="New software name"
                value={swName}
                onChange={(e) => setSwName(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
                onClick={() => {
                  if (!swName.trim()) return
                  createSwMut.mutate()
                }}
              >
                Create
              </button>
            </div>
          </section>
        ) : null}

        {access.isStudioAdmin ? (
          <>
            <Link
              to={`/studios/${sid}/settings/mcp`}
              className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700"
            >
              <h2 className="text-sm font-medium text-zinc-200">MCP server</h2>
              <p className="mt-1 text-xs text-zinc-500">
                API base URL, endpoints, and keys for coding-agent integrations.
              </p>
              <span className="mt-3 inline-block text-sm text-violet-400">Open →</span>
            </Link>

            <Link
              to={`/studios/${sid}/token-usage`}
              className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700"
            >
              <h2 className="text-sm font-medium text-zinc-200">Token usage</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Usage across members and projects in this studio (aggregated rows).
              </p>
              <span className="mt-3 inline-block text-sm text-violet-400">Open →</span>
            </Link>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="text-sm font-medium text-zinc-200">
                Request cross-studio access
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Ask Tool Admin for read or edit access to software owned by another studio.
                Paste the target software UUID (owner validates on approval).
              </p>
              {crossMsg ? (
                <p
                  className={`mt-3 text-sm ${crossMut.isError ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {crossMsg}
                </p>
              ) : null}
              <label className="mt-4 block text-xs text-zinc-500">
                Target software ID
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
                  value={targetSoftwareId}
                  onChange={(e) => {
                    setTargetSoftwareId(e.target.value)
                    setCrossMsg(null)
                  }}
                  placeholder="UUID"
                />
              </label>
              <label className="mt-3 block text-xs text-zinc-500">
                Requested access
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={requestedLevel}
                  onChange={(e) =>
                    setRequestedLevel(e.target.value as 'viewer' | 'external_editor')
                  }
                >
                  <option value="viewer">{crossStudioAccessLabel('viewer')}</option>
                  <option value="external_editor">
                    {crossStudioAccessLabel('external_editor')}
                  </option>
                </select>
              </label>
              <button
                type="button"
                disabled={!targetSoftwareId.trim() || crossMut.isPending}
                className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                onClick={() => {
                  setCrossMsg(null)
                  crossMut.mutate()
                }}
              >
                {crossMut.isPending ? 'Submitting…' : 'Submit request'}
              </button>
            </div>

            <div className="border-t border-zinc-800 pt-8">
              <button
                type="button"
                className="text-sm text-red-400 hover:underline"
                onClick={() => {
                  if (
                    confirm(
                      'Delete this studio and all software and projects under it?',
                    )
                  )
                    deleteMut.mutate()
                }}
              >
                Delete studio
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
