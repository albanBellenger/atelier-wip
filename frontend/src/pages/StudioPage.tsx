import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  addMember,
  deleteStudio,
  getStudio,
  listMembers,
  listSoftware,
  me,
  removeMember,
  updateMemberRole,
  updateStudio,
  createSoftware,
} from '../services/api'

export function StudioPage(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''

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

  const softwareQ = useQuery({
    queryKey: ['software', sid],
    queryFn: () => listSoftware(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const [studioName, setStudioName] = useState('')
  const [studioDesc, setStudioDesc] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'studio_admin' | 'studio_member'>(
    'studio_member',
  )
  const [swName, setSwName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const [studioFormSyncKey, setStudioFormSyncKey] = useState('')
  const st = studioQ.data
  const studioServerKey = st
    ? `${st.id}:${st.name}:${st.description ?? ''}`
    : ''
  if (st && studioServerKey !== studioFormSyncKey) {
    setStudioFormSyncKey(studioServerKey)
    setStudioName(st.name)
    setStudioDesc(st.description ?? '')
  }

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
    mutationFn: (vars: { userId: string; role: 'studio_admin' | 'studio_member' }) =>
      updateMemberRole(sid, vars.userId, vars.role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members', sid] })
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      setMsg('Role updated.')
    },
  })

  const createSwMut = useMutation({
    mutationFn: () =>
      createSoftware(sid, {
        name: swName.trim(),
      }),
    onSuccess: (sw) => {
      setSwName('')
      void qc.invalidateQueries({ queryKey: ['software', sid] })
      navigate(`/studios/${sid}/software/${sw.id}`)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteStudio(sid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studios'] })
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      navigate('/studios')
    },
  })

  if (!sid) {
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
        <p>You don&apos;t have access to this studio.</p>
        <Link to="/studios" className="mt-4 inline-block text-violet-400">
          Back to studios
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link to="/studios" className="text-sm text-violet-400 hover:underline">
            ← Studios
          </Link>
          <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            Home
          </Link>
        </div>

        {studioQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {studioQ.isError && (
          <p className="text-red-400">Could not load studio.</p>
        )}

        {studioQ.data && (
          <>
            <h1 className="text-2xl font-semibold">{studioQ.data.name}</h1>
            {msg && <p className="mt-2 text-sm text-emerald-400">{msg}</p>}

            {access.isStudioAdmin && (
              <form
                className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault()
                  updateMut.mutate()
                }}
              >
                <h2 className="mb-3 text-sm font-medium text-zinc-300">
                  Studio settings
                </h2>
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
                  type="submit"
                  className="mt-3 rounded-lg bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
                >
                  Save
                </button>
              </form>
            )}

            <section className="mt-10">
              <h2 className="text-lg font-medium">Software</h2>
              <ul className="mt-3 space-y-2">
                {softwareQ.data?.map((sw) => (
                  <li key={sw.id}>
                    <Link
                      className="block rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-600"
                      to={`/studios/${sid}/software/${sw.id}`}
                    >
                      {sw.name}
                    </Link>
                  </li>
                ))}
              </ul>
              {access.isStudioAdmin && (
                <form
                  className="mt-4 flex flex-wrap gap-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault()
                    if (!swName.trim()) return
                    createSwMut.mutate()
                  }}
                >
                  <input
                    className="flex-1 min-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="New software name"
                    value={swName}
                    onChange={(e) => setSwName(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
                  >
                    Add software
                  </button>
                </form>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium">Members</h2>
              <ul className="mt-3 space-y-2">
                {membersQ.data?.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 px-4 py-2 text-sm"
                  >
                    <span>
                      {m.display_name}{' '}
                      <span className="text-zinc-500">({m.email})</span> —{' '}
                      <span className="text-zinc-400">{m.role}</span>
                    </span>
                    {access.isStudioAdmin && (
                      <span className="flex gap-2">
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
                          Toggle admin
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:underline"
                          onClick={() => {
                            if (
                              confirm(`Remove ${m.email} from this studio?`)
                            )
                              removeMut.mutate(m.user_id)
                          }}
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {access.isStudioAdmin && (
                <form
                  className="mt-4 flex flex-wrap gap-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault()
                    addMut.mutate()
                  }}
                >
                  <input
                    type="email"
                    required
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
                        e.target.value as 'studio_admin' | 'studio_member',
                      )
                    }
                  >
                    <option value="studio_member">Member</option>
                    <option value="studio_admin">Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
                  >
                    Invite
                  </button>
                </form>
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
                        'Delete this studio and all software and projects under it?',
                      )
                    )
                      deleteMut.mutate()
                  }}
                >
                  Delete studio
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
