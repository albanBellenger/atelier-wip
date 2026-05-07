import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { APP_VERSION } from '../version'
import { STUDIO_ROLE_OPTIONS, crossStudioAccessLabel, studioRoleLabel } from '../lib/roleLabels'
import { STUDIO_BUDGET_OVERAGE_OPTIONS } from '../constants/studioBudgetOverage'
import { DEPLOYMENT_WIDE_HARD_CAP_USD } from '../data/adminConsoleMock'
import {
  addMember,
  createSoftware,
  getStudio,
  getStudioCrossStudioIncoming,
  getStudioCrossStudioOutgoing,
  getStudioMemberBudgets,
  listMembers,
  logout as logoutApi,
  me,
  patchStudioBudget,
  patchStudioMemberBudget,
  postStudioCrossStudioRequest,
  putStudioCrossStudioIncoming,
  removeMember,
  updateMemberRole,
  updateStudio,
  type AuthErrorBody,
  type CrossStudioIncomingRow,
  type StudioMemberBudgetRow,
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
  const hostedEnv = getHostedEnvironment()
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)

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
      void navigate(`/studios/${nextStudioId}/settings`)
    },
    [navigate],
  )

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
      void qc.invalidateQueries({ queryKey: ['studio', sid, 'cross-outgoing'] })
    },
    onError: (e: unknown) => {
      setCrossMsg(formatApiDetail(e))
    },
  })

  const incomingQ = useQuery({
    queryKey: ['studio', sid, 'cross-incoming'],
    queryFn: () => getStudioCrossStudioIncoming(sid, { limit: 200 }),
    enabled: Boolean(sid && access.isStudioAdmin),
  })

  const outgoingQ = useQuery({
    queryKey: ['studio', sid, 'cross-outgoing'],
    queryFn: () => getStudioCrossStudioOutgoing(sid, { limit: 200 }),
    enabled: Boolean(sid && access.isStudioAdmin),
  })

  const memberBudgetsQ = useQuery({
    queryKey: ['studio', sid, 'member-budgets'],
    queryFn: () => getStudioMemberBudgets(sid),
    enabled: Boolean(sid && access.isStudioAdmin),
  })

  const [studioCapInput, setStudioCapInput] = useState('')
  const [studioOverage, setStudioOverage] = useState<string>('pause_generations')
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null)
  const [incomingMsg, setIncomingMsg] = useState<string | null>(null)
  const [memberCaps, setMemberCaps] = useState<Record<string, string>>({})

  useEffect(() => {
    const d = studioQ.data
    if (!d) return
    const raw = d.budget_cap_monthly_usd
    setStudioCapInput(
      raw == null || raw === '' ? '' : String(typeof raw === 'number' ? raw : raw),
    )
    if (d.budget_overage_action) {
      setStudioOverage(d.budget_overage_action)
    }
  }, [studioQ.data?.id, studioQ.data?.budget_cap_monthly_usd, studioQ.data?.budget_overage_action])

  useEffect(() => {
    const rows = memberBudgetsQ.data
    if (!rows) return
    const next: Record<string, string> = {}
    for (const r of rows) {
      const c = r.budget_cap_monthly_usd
      next[r.user_id] = c == null || c === '' ? '' : String(c)
    }
    setMemberCaps(next)
  }, [memberBudgetsQ.data])

  const patchStudioBudgetMut = useMutation({
    mutationFn: () =>
      patchStudioBudget(sid, {
        budget_cap_monthly_usd: studioCapInput.trim()
          ? Number.parseFloat(studioCapInput.trim()).toFixed(2)
          : null,
        budget_overage_action: studioOverage,
      }),
    onSuccess: async () => {
      setBudgetMsg('Budget settings saved.')
      await qc.invalidateQueries({ queryKey: ['studio', sid] })
    },
    onError: (e: unknown) => {
      setBudgetMsg(formatApiDetail(e))
    },
  })

  const patchMemberBudgetMut = useMutation({
    mutationFn: (vars: { userId: string; capUsd: number | null }) =>
      patchStudioMemberBudget(sid, vars.userId, {
        budget_cap_monthly_usd: vars.capUsd == null ? null : vars.capUsd.toFixed(2),
      }),
    onSuccess: async () => {
      setBudgetMsg('Member cap updated.')
      await qc.invalidateQueries({ queryKey: ['studio', sid, 'member-budgets'] })
    },
    onError: (e: unknown) => {
      setBudgetMsg(formatApiDetail(e))
    },
  })

  const resolveIncomingMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: (vars: {
      grantId: string
      body: { decision: 'approve' | 'reject'; access_level?: 'viewer' | 'external_editor' }
    }) => putStudioCrossStudioIncoming(sid, vars.grantId, vars.body),
    onSuccess: async () => {
      setIncomingMsg(null)
      await qc.invalidateQueries({ queryKey: ['studio', sid, 'cross-incoming'] })
      await qc.invalidateQueries({ queryKey: ['studio', sid, 'cross-outgoing'] })
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (e: unknown) => {
      setIncomingMsg(formatApiDetail(e))
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

  const profile = profileQ.data

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={{ projectLabel: 'Studio settings' }}
        />

        <div className="mx-auto max-w-3xl space-y-8">
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

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="text-sm font-medium text-zinc-200">Usage &amp; budget</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Monthly spend cap and overage handling for this studio. Per-member caps cannot exceed
                the deployment ceiling of ${DEPLOYMENT_WIDE_HARD_CAP_USD.toFixed(2)} USD.
              </p>
              {budgetMsg ? (
                <p className="mt-2 text-sm text-emerald-400">{budgetMsg}</p>
              ) : null}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-zinc-500">
                  Studio monthly cap (USD)
                  <input
                    type="number"
                    min={0}
                    step={50}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    value={studioCapInput}
                    onChange={(e) => {
                      setBudgetMsg(null)
                      setStudioCapInput(e.target.value)
                    }}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  When over monthly cap
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    value={studioOverage}
                    onChange={(e) => {
                      setBudgetMsg(null)
                      setStudioOverage(e.target.value)
                    }}
                  >
                    {STUDIO_BUDGET_OVERAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                disabled={patchStudioBudgetMut.isPending}
                className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                onClick={() => {
                  setBudgetMsg(null)
                  patchStudioBudgetMut.mutate()
                }}
              >
                {patchStudioBudgetMut.isPending ? 'Saving…' : 'Save studio budget'}
              </button>

              <h3 className="mt-8 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Per-member caps
              </h3>
              {memberBudgetsQ.isPending ? (
                <p className="mt-2 text-sm text-zinc-500">Loading…</p>
              ) : memberBudgetsQ.isError ? (
                <p className="mt-2 text-sm text-red-400">Could not load member budgets.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {memberBudgetsQ.data?.map((r: StudioMemberBudgetRow) => (
                    <li
                      key={r.user_id}
                      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-zinc-200">{r.display_name}</div>
                        <div className="text-xs text-zinc-500">{r.email}</div>
                      </div>
                      <label className="text-xs text-zinc-500">
                        Cap (USD)
                        <input
                          type="number"
                          min={0}
                          step={25}
                          className="mt-1 w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                          value={memberCaps[r.user_id] ?? ''}
                          onChange={(e) => {
                            setBudgetMsg(null)
                            setMemberCaps((prev) => ({
                              ...prev,
                              [r.user_id]: e.target.value,
                            }))
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={patchMemberBudgetMut.isPending}
                        className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
                        onClick={() => {
                          const raw = (memberCaps[r.user_id] ?? '').trim()
                          const n = raw === '' ? null : Number.parseFloat(raw)
                          if (n != null && (Number.isNaN(n) || n < 0)) {
                            setBudgetMsg('Invalid cap.')
                            return
                          }
                          patchMemberBudgetMut.mutate({
                            userId: r.user_id,
                            capUsd: n,
                          })
                        }}
                      >
                        Save
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="text-sm font-medium text-zinc-200">Access requests</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Incoming requests target software in this studio. Outbound requests are decided by
                the other studio&apos;s owners.
              </p>
              {incomingMsg ? <p className="mt-2 text-sm text-red-400">{incomingMsg}</p> : null}

              <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Incoming
              </h3>
              {incomingQ.isPending ? (
                <p className="mt-2 text-sm text-zinc-500">Loading…</p>
              ) : incomingQ.isError ? (
                <p className="mt-2 text-sm text-red-400">Could not load incoming requests.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {(incomingQ.data ?? []).length === 0 ? (
                    <li className="text-zinc-500">No requests.</li>
                  ) : (
                    (incomingQ.data ?? []).map((row: CrossStudioIncomingRow) => (
                      <li
                        key={row.id}
                        className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-200"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium">{row.target_software_name}</div>
                            <div className="text-xs text-zinc-500">
                              From {row.requesting_studio_name} · {row.requester_email}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {crossStudioAccessLabel(row.access_level as 'viewer' | 'external_editor')}{' '}
                              · {row.status}
                            </div>
                          </div>
                          {row.status === 'pending' ? (
                            <span className="flex gap-2">
                              <button
                                type="button"
                                className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                                disabled={resolveIncomingMut.isPending}
                                onClick={() => {
                                  setIncomingMsg(null)
                                  resolveIncomingMut.mutate({
                                    grantId: row.id,
                                    body: {
                                      decision: 'approve',
                                      access_level:
                                        row.access_level === 'external_editor'
                                          ? 'external_editor'
                                          : 'viewer',
                                    },
                                  })
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
                                disabled={resolveIncomingMut.isPending}
                                onClick={() => {
                                  setIncomingMsg(null)
                                  resolveIncomingMut.mutate({
                                    grantId: row.id,
                                    body: { decision: 'reject' },
                                  })
                                }}
                              >
                                Reject
                              </button>
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}

              <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Outgoing
              </h3>
              {outgoingQ.isPending ? (
                <p className="mt-2 text-sm text-zinc-500">Loading…</p>
              ) : outgoingQ.isError ? (
                <p className="mt-2 text-sm text-red-400">Could not load outgoing requests.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {(outgoingQ.data ?? []).length === 0 ? (
                    <li className="text-zinc-500">No outbound requests.</li>
                  ) : (
                    (outgoingQ.data ?? []).map((row) => (
                      <li
                        key={row.id}
                        className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-200"
                      >
                        <div className="font-medium">{row.target_software_name}</div>
                        <div className="text-xs text-zinc-500">
                          Owner studio: {row.owner_studio_name} ·{' '}
                          {crossStudioAccessLabel(row.access_level as 'viewer' | 'external_editor')} ·{' '}
                          {row.status}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}

              <h3 className="mt-8 text-xs font-medium uppercase tracking-wide text-zinc-500">
                New outbound request
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Paste the target software UUID. The other studio&apos;s owners approve or reject.
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

          </>
        ) : null}
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
          <span>Atelier · Builder workspace</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
            <Link
              to="/changelog"
              className="text-zinc-500 hover:text-zinc-300 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              v{APP_VERSION}
            </Link>
            <span className="select-none font-sans text-zinc-700" aria-hidden>
              ·
            </span>
            <span
              className="rounded border border-zinc-700/70 px-1.5 py-px text-[10px] font-sans font-normal uppercase tracking-wider text-zinc-500"
              title={`Hosted environment: ${hostedEnvLabel}`}
            >
              {hostedEnvLabel}
            </span>
          </span>
        </footer>
      </div>
    </div>
  )
}
