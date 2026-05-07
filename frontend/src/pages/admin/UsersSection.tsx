import type { ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Dot,
  PageTitle,
  Pill,
  Segmented,
  Table,
  THead,
  TRow,
  Avatar,
} from '../../components/admin/adminPrimitives'
import type { AdminUserDirectoryRow, RegisterRequestBody } from '../../services/api'
import {
  addMember,
  getAdminUsers,
  listStudios,
  me,
  postAdminCreateUser,
  putAdminUserPlatformAdminStatus,
} from '../../services/api'
import { STUDIO_ROLE_OPTIONS, studioRoleLabel } from '../../lib/roleLabels'

function formatApiErr(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as { detail: unknown }).detail
    if (typeof d === 'string') return d
    try {
      return JSON.stringify(d)
    } catch {
      return 'Request failed'
    }
  }
  return err instanceof Error ? err.message : 'Request failed'
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatJoined(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d)
  } catch {
    return '—'
  }
}

function membershipsSorted(
  m: AdminUserDirectoryRow['studio_memberships'],
): AdminUserDirectoryRow['studio_memberships'] {
  return [...m].sort((a, b) => a.studio_name.localeCompare(b.studio_name))
}

function CreateUserDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  errorText,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (body: RegisterRequestBody) => void
  isPending: boolean
  errorText: string | null
}): ReactElement | null {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (!open) return
    setEmail('')
    setPassword('')
    setDisplayName('')
  }, [open])

  if (!open) {
    return null
  }

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 8 &&
    displayName.trim().length > 0 &&
    !isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-[#0f0f10] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-user-title" className="text-[15px] font-medium text-zinc-100">
          Create user
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
          Registers a new account in Atelier. They can sign in with this email and password. They
          are not added to a studio until you use Add to studio.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-[11px] font-medium text-zinc-500" htmlFor="create-user-email">
            Email
            <input
              id="create-user-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 font-mono text-[13px] text-zinc-200 outline-none focus:border-zinc-600"
            />
          </label>
          <label
            className="block text-[11px] font-medium text-zinc-500"
            htmlFor="create-user-display"
          >
            Display name
            <input
              id="create-user-display"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 text-[13px] text-zinc-200 outline-none focus:border-zinc-600"
            />
          </label>
          <label
            className="block text-[11px] font-medium text-zinc-500"
            htmlFor="create-user-password"
          >
            Initial password
            <input
              id="create-user-password"
              type="password"
              autoComplete="new-password"
              aria-label="Initial password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 font-mono text-[13px] text-zinc-200 outline-none focus:border-zinc-600"
            />
            <span className="mt-1 block text-[11px] text-zinc-600">
              At least 8 characters (bcrypt limit applies).
            </span>
          </label>
        </div>
        {errorText ? (
          <p className="mt-3 text-[12px] text-rose-300" role="alert">
            {errorText}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Btn type="button" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Btn>
          <Btn
            type="button"
            size="sm"
            tone="primary"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              onSubmit({
                email: email.trim(),
                password,
                display_name: displayName.trim(),
              })
            }}
          >
            {isPending ? 'Creating…' : 'Create account'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

function AddToStudioDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  errorText,
  studios,
  studiosLoading,
  directoryUsers,
  directoryLoading,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (args: {
    studioId: string
    email: string
    role: 'studio_admin' | 'studio_member' | 'studio_viewer'
  }) => void
  isPending: boolean
  errorText: string | null
  studios: { id: string; name: string }[]
  studiosLoading: boolean
  directoryUsers: AdminUserDirectoryRow[]
  directoryLoading: boolean
}): ReactElement | null {
  const [studioId, setStudioId] = useState('')
  const [pickEmail, setPickEmail] = useState('')
  const [typedEmail, setTypedEmail] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [role, setRole] = useState<'studio_admin' | 'studio_member' | 'studio_viewer'>(
    'studio_member',
  )

  const usersSuggestable = useMemo(() => {
    if (!studioId) return directoryUsers
    return directoryUsers.filter(
      (u) => !u.studio_memberships.some((m) => m.studio_id === studioId),
    )
  }, [directoryUsers, studioId])

  const filteredSuggestable = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return usersSuggestable
    return usersSuggestable.filter(
      (u) =>
        u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q),
    )
  }, [usersSuggestable, userSearch])

  const effectiveEmail = typedEmail.trim() || pickEmail

  const pickedUser = useMemo(
    () => directoryUsers.find((u) => u.email === pickEmail) ?? null,
    [directoryUsers, pickEmail],
  )

  useEffect(() => {
    if (!open) return
    setPickEmail('')
    setTypedEmail('')
    setUserSearch('')
  }, [open, studioId])

  useEffect(() => {
    if (!open) return
    setRole('studio_member')
  }, [open])

  useEffect(() => {
    if (!open) return
    if (studios.length === 0) {
      setStudioId('')
      return
    }
    setStudioId((cur) =>
      cur && studios.some((s) => s.id === cur) ? cur : studios[0].id,
    )
  }, [open, studios])

  if (!open) {
    return null
  }

  const canSubmit =
    studioId.length > 0 &&
    effectiveEmail.trim().length > 0 &&
    studios.length > 0 &&
    !isPending &&
    !studiosLoading &&
    !directoryLoading

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-studio-title"
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-[#0f0f10] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-to-studio-title" className="text-[15px] font-medium text-zinc-100">
          Grant studio access
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
          Adds an <span className="font-medium text-zinc-400">existing</span> account to a
          studio (same email they used to register). They cannot be invited by email before
          signing up.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-[11px] font-medium text-zinc-500">
            Studio
            <select
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 text-[13px] text-zinc-200 outline-none focus:border-zinc-600"
              value={studioId}
              onChange={(e) => setStudioId(e.target.value)}
              disabled={studiosLoading || studios.length === 0}
            >
              {studios.length === 0 ? (
                <option value="">No studios</option>
              ) : (
                studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <div>
            <span id="add-to-studio-user-label" className="block text-[11px] font-medium text-zinc-500">
              User
            </span>
            {pickedUser && !typedEmail.trim() ? (
              <div
                className="mt-1.5 inline-flex max-w-full flex-col rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 py-1.5"
                aria-live="polite"
              >
                <span className="truncate text-[13px] text-zinc-100">{pickedUser.display_name}</span>
                <span className="truncate font-mono text-[11px] text-zinc-500">{pickedUser.email}</span>
              </div>
            ) : null}
            <div
              className="mt-1.5 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/80"
              role="group"
              aria-labelledby="add-to-studio-user-label"
            >
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name or email…"
                aria-label="Search users by name or email"
                className="w-full border-0 border-b border-zinc-800 bg-transparent px-2.5 py-1.5 text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
              />
              <ul
                className="max-h-36 overflow-y-auto py-1"
                role="listbox"
                aria-label="Matching users"
              >
                {directoryLoading ? (
                  <li className="px-2.5 py-2 text-[12px] text-zinc-500">Loading…</li>
                ) : filteredSuggestable.length === 0 ? (
                  <li className="px-2.5 py-2 text-[12px] text-zinc-500">
                    {usersSuggestable.length === 0 && directoryUsers.length > 0
                      ? 'Everyone is already in this studio — use another studio or type an email below.'
                      : usersSuggestable.length === 0
                        ? 'No users in directory.'
                        : 'No matches — try another search or type an email below.'}
                  </li>
                ) : (
                  filteredSuggestable.map((u) => {
                    const selected = pickEmail === u.email && !typedEmail.trim()
                    return (
                      <li key={u.user_id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`flex w-full flex-col items-start px-2.5 py-2 text-left transition hover:bg-zinc-900/80 ${selected ? 'bg-zinc-900/80' : ''}`}
                          onClick={() => {
                            setPickEmail(u.email)
                            setTypedEmail('')
                            setUserSearch('')
                          }}
                        >
                          <span className="text-[13px] text-zinc-100">{u.display_name}</span>
                          <span className="font-mono text-[11px] text-zinc-500">{u.email}</span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
            <label className="mt-2 block text-[11px] font-medium text-zinc-500" htmlFor="add-to-studio-email-manual">
              Or enter email
              <input
                id="add-to-studio-email-manual"
                type="email"
                autoComplete="off"
                value={typedEmail}
                onChange={(e) => {
                  const v = e.target.value
                  setTypedEmail(v)
                  if (v.trim()) {
                    setPickEmail('')
                  }
                }}
                placeholder="name@company.com"
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 font-mono text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
              />
            </label>
          </div>
          <label className="block text-[11px] font-medium text-zinc-500" htmlFor="add-to-studio-role">
            Role in this studio
            <select
              id="add-to-studio-role"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 text-[13px] text-zinc-200 outline-none focus:border-zinc-600"
              value={role}
              aria-label="Studio role: Owner, Builder, or Viewer"
              onChange={(e) =>
                setRole(e.target.value as 'studio_admin' | 'studio_member' | 'studio_viewer')
              }
            >
              {STUDIO_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.short}
                </option>
              ))}
            </select>
          </label>
        </div>
        {errorText ? (
          <p className="mt-3 text-[12px] text-rose-300" role="alert">
            {errorText}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Btn type="button" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Btn>
          <Btn
            type="button"
            size="sm"
            tone="primary"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              onSubmit({ studioId, email: effectiveEmail.trim(), role })
            }}
          >
            {isPending ? 'Granting…' : 'Grant access'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

export function UsersSection(): ReactElement {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'platform' | 'members'>('all')
  const [search, setSearch] = useState('')
  const [addToStudioOpen, setAddToStudioOpen] = useState(false)
  const [addToStudioError, setAddToStudioError] = useState<string | null>(null)
  const [createUserOpen, setCreateUserOpen] = useState(false)

  const meQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  const dirQ = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => getAdminUsers({ limit: 500 }),
    retry: false,
  })

  const adminMut = useMutation({
    mutationFn: (args: { userId: string; is_platform_admin: boolean }) =>
      putAdminUserPlatformAdminStatus(args.userId, {
        is_platform_admin: args.is_platform_admin,
      }),
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      if (vars.userId === meQ.data?.user.id) {
        await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      }
    },
  })

  const studiosQ = useQuery({
    queryKey: ['studios', 'list'],
    queryFn: () => listStudios(),
    retry: false,
  })

  const addToStudioMut = useMutation({
    mutationFn: (args: {
      studioId: string
      email: string
      role: 'studio_admin' | 'studio_member' | 'studio_viewer'
    }) =>
      addMember(args.studioId, {
        email: args.email.toLowerCase(),
        role: args.role,
      }),
    onSuccess: async () => {
      setAddToStudioError(null)
      setAddToStudioOpen(false)
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: unknown) => {
      setAddToStudioError(formatApiErr(err))
    },
  })

  const createUserMut = useMutation({
    mutationFn: (body: RegisterRequestBody) => postAdminCreateUser(body),
    onSuccess: async () => {
      setCreateUserOpen(false)
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const counts = useMemo(() => {
    const list = dirQ.data ?? []
    return {
      all: list.length,
      platform: list.filter((u) => u.is_platform_admin).length,
      members: list.filter((u) => !u.is_platform_admin).length,
    }
  }, [dirQ.data])

  const rows = useMemo(() => {
    const list = dirQ.data ?? []
    const needle = search.trim().toLowerCase()
    return list.filter((u) => {
      if (filter === 'platform' && !u.is_platform_admin) return false
      if (filter === 'members' && u.is_platform_admin) return false
      if (!needle) return true
      if (u.email.toLowerCase().includes(needle)) return true
      if (u.display_name.toLowerCase().includes(needle)) return true
      return u.studio_memberships.some((s) => s.studio_name.toLowerCase().includes(needle))
    })
  }, [dirQ.data, filter, search])

  const currentUserId = meQ.data?.user.id

  return (
    <div className="space-y-6">
      <PageTitle
        title="Users & roles"
        subtitle="Everyone registered in Atelier, which studios they belong to, and platform administrator access. Use Add to studio to grant an existing account access and choose Owner, Builder, or Viewer."
      />

      {dirQ.isError ? (
        <p className="text-[12px] text-rose-300">
          Could not load user directory. {formatApiErr(dirQ.error)}
        </p>
      ) : null}

      {adminMut.isError ? (
        <p className="text-[12px] text-rose-300">{formatApiErr(adminMut.error)}</p>
      ) : null}

      <Card
        title="Directory"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              type="button"
              size="sm"
              tone="primary"
              style={{ background: ADMIN_CONSOLE_ACCENT }}
              onClick={() => {
                createUserMut.reset()
                setCreateUserOpen(true)
              }}
            >
              Create user
            </Btn>
            <Btn
              type="button"
              size="sm"
              tone="primary"
              style={{ background: ADMIN_CONSOLE_ACCENT }}
              onClick={() => {
                setAddToStudioError(null)
                setAddToStudioOpen(true)
              }}
            >
              Add to studio
            </Btn>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                ['all', `All ${counts.all}`],
                ['platform', `Platform admins ${counts.platform}`],
                ['members', `Members ${counts.members}`],
              ]}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, studio…"
              aria-label="Search users"
              className="w-52 rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600 sm:w-64"
            />
          </div>
        }
      >
        {dirQ.isPending ? (
          <p className="px-1 py-4 text-[13px] text-zinc-500">Loading users…</p>
        ) : (
          <Table>
            <THead
              cols={[
                'User',
                'Studios',
                'Studio roles',
                'Platform admin',
                'Joined',
                '',
              ]}
              grid="grid-cols-[minmax(12rem,1.6fr)_minmax(7rem,1fr)_minmax(10rem,1.3fr)_7rem_7.5rem_minmax(8.5rem,auto)]"
            />
            {rows.length === 0 ? (
              <div className="border-b border-zinc-800/60 px-5 py-6 text-[13px] text-zinc-500">
                No users match this filter.
              </div>
            ) : (
              rows.map((u) => {
                const sorted = membershipsSorted(u.studio_memberships)
                const studioList =
                  sorted.map((m) => m.studio_name).join(', ') || '—'
                const selfRow = u.user_id === currentUserId
                return (
                  <TRow
                    key={u.user_id}
                    grid="grid-cols-[minmax(12rem,1.6fr)_minmax(7rem,1fr)_minmax(10rem,1.3fr)_7rem_7.5rem_minmax(8.5rem,auto)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={initialsFromName(u.display_name)} muted={false} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-zinc-100">{u.display_name}</div>
                        <div className="truncate font-mono text-[11px] text-zinc-500">{u.email}</div>
                      </div>
                    </div>
                    <span className="truncate text-[12px] text-zinc-300" title={studioList}>
                      {studioList}
                    </span>
                    <div className="min-w-0">
                      {sorted.length === 0 ? (
                        <span className="text-[11px] text-zinc-500">Not in any studio</span>
                      ) : (
                        <ul className="space-y-0.5 text-[11px] leading-snug text-zinc-400">
                          {sorted.map((m) => (
                            <li key={m.studio_id}>
                              <span className="text-zinc-300">{m.studio_name}</span>
                              <span className="text-zinc-600"> · </span>
                              <span>{studioRoleLabel(m.role)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span>
                      {u.is_platform_admin ? (
                        <Pill tone="violet">
                          <Dot tone="violet" />
                          Platform admin
                        </Pill>
                      ) : (
                        <span className="text-[12px] text-zinc-600">—</span>
                      )}
                    </span>
                    <span className="text-[12px] tabular-nums text-zinc-400">
                      {formatJoined(u.created_at)}
                    </span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {u.is_platform_admin ? (
                        <Btn
                          type="button"
                          size="sm"
                          disabled={adminMut.isPending || selfRow}
                          title={
                            selfRow
                              ? 'Another platform admin must revoke your access.'
                              : undefined
                          }
                          onClick={() =>
                            adminMut.mutate({
                              userId: u.user_id,
                              is_platform_admin: false,
                            })
                          }
                        >
                          Remove platform admin
                        </Btn>
                      ) : (
                        <Btn
                          type="button"
                          size="sm"
                          tone="primary"
                          style={{ background: ADMIN_CONSOLE_ACCENT }}
                          disabled={adminMut.isPending}
                          onClick={() =>
                            adminMut.mutate({
                              userId: u.user_id,
                              is_platform_admin: true,
                            })
                          }
                        >
                          Grant platform admin
                        </Btn>
                      )}
                    </div>
                  </TRow>
                )
              })
            )}
          </Table>
        )}
      </Card>

      <Card title="Roles & permissions">
        <Table>
          <THead
            cols={[
              'Capability',
              'Platform admin',
              'Owner',
              'Builder',
              'External',
              'Studio Viewer',
              'Viewer',
            ]}
            grid="grid-cols-[2fr_repeat(6,minmax(0,1fr))]"
          />
          {(
            [
              ['Create studios', [true, false, false, false, false, false]],
              ['Manage budgets', [true, true, false, false, false, false]],
              ['Connect Git provider', [true, true, false, false, false, false]],
              ['Edit software definition', [true, true, false, false, false, false]],
              ['Edit spec sections', [true, true, true, true, false, false]],
              ['Generate work orders', [true, true, true, true, false, false]],
              ['Read-only access', [true, true, true, true, true, true]],
            ] as const
          ).map(([cap, perms]) => (
            <TRow key={cap} grid="grid-cols-[2fr_repeat(6,minmax(0,1fr))]">
              <span className="text-[12.5px] text-zinc-200">{cap}</span>
              {perms.map((p, i) => (
                <span
                  key={`${cap}-${i}`}
                  className={`font-mono text-[14px] ${p ? 'text-emerald-300' : 'text-zinc-700'}`}
                >
                  {p ? '●' : '○'}
                </span>
              ))}
            </TRow>
          ))}
        </Table>
        <p className="border-t border-zinc-800/60 px-5 py-3 text-[11px] text-zinc-500">
          External and the last Viewer column apply to cross-studio grants on a specific software.
          Studio Viewer is the home-studio read-only role. Manage pending requests under{' '}
          <Link className="text-violet-400 hover:underline" to="/admin/cross-studio">
            Cross-studio access
          </Link>
          .
        </p>
      </Card>

      <CreateUserDialog
        open={createUserOpen}
        onClose={() => {
          setCreateUserOpen(false)
          createUserMut.reset()
        }}
        onSubmit={(body) => createUserMut.mutate(body)}
        isPending={createUserMut.isPending}
        errorText={createUserMut.isError ? formatApiErr(createUserMut.error) : null}
      />

      <AddToStudioDialog
        open={addToStudioOpen}
        onClose={() => {
          setAddToStudioOpen(false)
          setAddToStudioError(null)
        }}
        onSubmit={(args) => {
          setAddToStudioError(null)
          addToStudioMut.mutate(args)
        }}
        isPending={addToStudioMut.isPending}
        errorText={
          studiosQ.isError
            ? formatApiErr(studiosQ.error)
            : addToStudioError
        }
        studios={studiosQ.data ?? []}
        studiosLoading={studiosQ.isPending}
        directoryUsers={dirQ.data ?? []}
        directoryLoading={dirQ.isPending}
      />
    </div>
  )
}
