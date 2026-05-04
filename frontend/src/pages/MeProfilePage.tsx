import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { me, patchMeProfile } from '../services/api'

function studioRoleLabel(role: string): string {
  switch (role) {
    case 'studio_admin':
      return 'Admin'
    case 'studio_member':
      return 'Builder'
    case 'viewer':
    case 'studio_viewer':
      return 'Viewer'
    default:
      return role
  }
}

export function MeProfilePage(): ReactElement {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: profile, isPending, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })
  const [name, setName] = useState('')

  useEffect(() => {
    if (isError) {
      void navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  useEffect(() => {
    if (profile) setName(profile.user.display_name)
  }, [profile])

  const save = useMutation({
    mutationFn: () => patchMeProfile({ display_name: name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })

  function onSubmit(e: FormEvent): void {
    e.preventDefault()
    void save.mutateAsync()
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (isPending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-md">
        <Link
          to="/"
          className="text-sm font-medium text-violet-400 hover:underline"
        >
          ← Back to home
        </Link>
        <h1 className="mt-6 font-serif text-3xl font-medium tracking-tight text-zinc-100">
          Profile
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-lg font-medium text-zinc-100">
            {profile.user.display_name}
          </p>
          {profile.user.is_tool_admin ? (
            <span className="rounded-md border border-violet-500/40 bg-violet-600/20 px-2 py-0.5 text-xs font-medium text-violet-300">
              Tool Admin
            </span>
          ) : null}
        </div>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-zinc-400" htmlFor="profile-email">
            Email
            <input
              id="profile-email"
              readOnly
              aria-readonly="true"
              className="mt-1 w-full cursor-default rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-zinc-400 outline-none"
              value={profile.user.email}
            />
          </label>
          <p className="text-xs text-zinc-600">
            Email is your login identifier and cannot be changed here.
          </p>
          <label className="block text-sm text-zinc-400" htmlFor="profile-display-name">
            Display name
            <input
              id="profile-display-name"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-violet-600"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (save.isSuccess || save.isError) save.reset()
              }}
              maxLength={255}
              required
            />
          </label>
          {save.isError ? (
            <p className="text-sm text-rose-400">Could not save. Check your input.</p>
          ) : null}
          {save.isSuccess ? (
            <p className="text-sm text-emerald-400">Saved.</p>
          ) : null}
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Save
          </button>
        </form>

        <section className="mt-12" aria-labelledby="studio-memberships-heading">
          <h2
            id="studio-memberships-heading"
            className="font-serif text-xl font-medium tracking-tight text-zinc-100"
          >
            Studio memberships
          </h2>
          {profile.studios.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              You&apos;re not a member of any studio yet.{' '}
              <Link to="/studios" className="font-medium text-violet-400 hover:underline">
                Browse studios
              </Link>
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-950/50">
              {profile.studios.map((s) => (
                <li
                  key={s.studio_id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <Link
                    to={`/studios/${s.studio_id}`}
                    className="font-medium text-violet-400 hover:underline"
                  >
                    {s.studio_name}
                  </Link>
                  <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {studioRoleLabel(s.role)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
